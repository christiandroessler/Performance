// Minimaler FIT-Binaerparser (Garmin/Wahoo-Originaldateien im Strava-Datenexport).
//
// Verifiziert gegen eine synthetische Testdatei (test/importers/fit.test.js)
// UND gegen eine echte Geraetedatei (Garmin/Wahoo, 2h-Intervalltraining,
// 7037 record-Meldungen, siehe core/README.md "Stand der Verifikation" und
// scripts/verify-fit.js). Ungewoehnliche Geraete-Varianten (andere
// Entwicklerfelder, abweichende Skalierungen) sind weiterhin nicht
// ausgeschlossen - bei neuen Datenquellen mit scripts/verify-fit.js
// gegenpruefen.
//
// Unterstuetzt: Definitions-/Datenmeldungen, normale und komprimierte
// Zeitstempel-Header, Little- und Big-Endian, die "record"-Meldung
// (global mesg num 20) mit den Feldern timestamp/power/heart_rate/cadence/
// distance/speed/altitude. Entwicklerfelder werden erkannt und ueberlesen
// (Groesse bekannt), aber nicht ausgewertet. Keine CRC-Pruefung.

const FIT_EPOCH_S = 631065600; // 1989-12-31T00:00:00Z (UTC-Sekunden)
const RECORD_MESG_NUM = 20;

const BASE_TYPES = {
  0x00: { size: 1, invalid: 0xff, read: (v, o) => v.getUint8(o) },
  0x01: { size: 1, invalid: 0x7f, read: (v, o) => v.getInt8(o) },
  0x02: { size: 1, invalid: 0xff, read: (v, o) => v.getUint8(o) },
  0x83: { size: 2, invalid: 0x7fff, read: (v, o, le) => v.getInt16(o, le) },
  0x84: { size: 2, invalid: 0xffff, read: (v, o, le) => v.getUint16(o, le) },
  0x85: { size: 4, invalid: 0x7fffffff, read: (v, o, le) => v.getInt32(o, le) },
  0x86: { size: 4, invalid: 0xffffffff, read: (v, o, le) => v.getUint32(o, le) },
  0x88: { size: 4, invalid: null, read: (v, o, le) => v.getFloat32(o, le) },
  0x89: { size: 8, invalid: null, read: (v, o, le) => v.getFloat64(o, le) },
  0x0a: { size: 1, invalid: 0x00, read: (v, o) => v.getUint8(o) },
  0x8b: { size: 2, invalid: 0x0000, read: (v, o, le) => v.getUint16(o, le) },
  0x8c: { size: 4, invalid: 0x00000000, read: (v, o, le) => v.getUint32(o, le) },
  0x07: { size: 1, isString: true },
  0x0d: { size: 1, isByte: true },
};

// record-Felder (global mesg num 20), Feldnummer -> Skalierung
const RECORD_FIELDS = {
  253: 'timestamp',
  0: 'positionLat',
  1: 'positionLong',
  2: 'altitude', // uint16, Skala 5, Offset 500
  3: 'heartrate', // uint8, bpm
  4: 'cadence', // uint8, rpm
  5: 'distance', // uint32, Skala 100 -> m
  6: 'speed', // uint16, Skala 1000 -> m/s
  7: 'power', // uint16, W
};

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ startTime: string|null, points: import('../types.js').RawStreamPoint[] }}
 */
export function parseFit(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const headerSize = view.getUint8(0);
  const dataSize = view.getUint32(4, true);
  const end = headerSize + dataSize;

  const localDefs = new Map();
  const rawRecords = [];
  let lastTimestamp = null;

  let offset = headerSize;
  while (offset < end && offset < arrayBuffer.byteLength) {
    const headerByte = view.getUint8(offset);
    offset += 1;

    if (headerByte & 0x80) {
      // Komprimierter Zeitstempel-Header
      const localType = (headerByte >> 5) & 0x03;
      const timeOffset = headerByte & 0x1f;
      const def = localDefs.get(localType);
      if (!def || lastTimestamp == null) break;

      let ts = (lastTimestamp & ~0x1f) | timeOffset;
      if (ts < lastTimestamp) ts += 32;
      lastTimestamp = ts;

      const { values, bytesRead } = readDataFields(view, offset, def.fields, def.littleEndian);
      offset += bytesRead;
      for (const df of def.devFields) offset += df.size;
      if (def.globalMesgNum === RECORD_MESG_NUM) rawRecords.push(toRawRecord(values, lastTimestamp));
      continue;
    }

    const isDefinition = (headerByte & 0x40) !== 0;
    const localType = headerByte & 0x0f;

    if (isDefinition) {
      const hasDeveloperData = (headerByte & 0x20) !== 0;
      offset += 1; // reserved
      const architecture = view.getUint8(offset);
      offset += 1;
      const littleEndian = architecture === 0;
      const globalMesgNum = view.getUint16(offset, littleEndian);
      offset += 2;
      const numFields = view.getUint8(offset);
      offset += 1;

      const fields = [];
      for (let i = 0; i < numFields; i++) {
        fields.push({
          num: view.getUint8(offset),
          size: view.getUint8(offset + 1),
          baseType: view.getUint8(offset + 2),
        });
        offset += 3;
      }

      const devFields = [];
      if (hasDeveloperData) {
        const numDev = view.getUint8(offset);
        offset += 1;
        for (let i = 0; i < numDev; i++) {
          devFields.push({ num: view.getUint8(offset), size: view.getUint8(offset + 1) });
          offset += 3;
        }
      }

      localDefs.set(localType, { littleEndian, globalMesgNum, fields, devFields });
      continue;
    }

    // Datenmeldung
    const def = localDefs.get(localType);
    if (!def) break;
    const { values, bytesRead } = readDataFields(view, offset, def.fields, def.littleEndian);
    offset += bytesRead;
    for (const df of def.devFields) offset += df.size;

    if (values[253] != null) lastTimestamp = values[253];
    if (def.globalMesgNum === RECORD_MESG_NUM && lastTimestamp != null) {
      rawRecords.push(toRawRecord(values, lastTimestamp));
    }
  }

  rawRecords.sort((a, b) => a.timestamp - b.timestamp);
  const t0 = rawRecords.length ? rawRecords[0].timestamp : null;

  return {
    startTime: t0 != null ? new Date(t0 * 1000).toISOString() : null,
    points: rawRecords.map((r) => ({
      t: r.timestamp - t0,
      watts: r.power,
      deviceWatts: r.power != null,
      heartrate: r.heartrate,
      cadence: r.cadence,
      velocity: r.speed,
      distance: r.distance,
      altitude: r.altitude,
    })),
  };
}

function readDataFields(view, offset, fieldDefs, littleEndian) {
  const values = {};
  let o = offset;
  for (const f of fieldDefs) {
    const type = BASE_TYPES[f.baseType];
    if (!type || type.isString || type.isByte) {
      o += f.size;
      continue;
    }
    let value = type.size <= f.size ? type.read(view, o, littleEndian) : null;
    if (value === type.invalid) value = null;
    values[f.num] = value;
    o += f.size;
  }
  return { values, bytesRead: o - offset };
}

function toRawRecord(values, timestampRawFitEpoch) {
  return {
    timestamp: FIT_EPOCH_S + timestampRawFitEpoch,
    power: values[7] ?? null,
    heartrate: values[3] ?? null,
    cadence: values[4] ?? null,
    distance: values[5] != null ? values[5] / 100 : null,
    speed: values[6] != null ? values[6] / 1000 : null,
    altitude: values[2] != null ? values[2] / 5 - 500 : null,
  };
}
