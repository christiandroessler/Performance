// Rundlauf-Test fuer den FIT-Parser mit einer selbst konstruierten, minimalen
// FIT-Datei (1 Definitionsmeldung + 2 Datenmeldungen). Ersetzt NICHT den Test
// gegen eine echte Geraetedatei - siehe src/importers/fit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFit } from '../../src/importers/fit.js';

const FIT_EPOCH_S = 631065600;

function buildMinimalFit() {
  const fields = [
    { num: 253, size: 4, baseType: 0x86 }, // timestamp, uint32
    { num: 7, size: 2, baseType: 0x84 }, // power, uint16
    { num: 3, size: 1, baseType: 0x02 }, // heart_rate, uint8
  ];

  const defBytes = [
    0x40, // Header: Definitionsmeldung, local type 0
    0x00, // reserved
    0x00, // Architektur: little endian
    20,
    0, // global mesg num = 20 (record), uint16 LE
    fields.length,
    ...fields.flatMap((f) => [f.num, f.size, f.baseType]),
  ];

  function dataBytes(timestampRaw, power, hr) {
    const buf = [0x00]; // Header: Datenmeldung, local type 0
    const ts = new DataView(new ArrayBuffer(4));
    ts.setUint32(0, timestampRaw, true);
    for (let i = 0; i < 4; i++) buf.push(ts.getUint8(i));
    const pw = new DataView(new ArrayBuffer(2));
    pw.setUint16(0, power, true);
    for (let i = 0; i < 2; i++) buf.push(pw.getUint8(i));
    buf.push(hr);
    return buf;
  }

  const baseTs = Math.floor(Date.UTC(2026, 0, 1, 8, 0, 0) / 1000) - FIT_EPOCH_S;
  const data = [...defBytes, ...dataBytes(baseTs, 250, 140), ...dataBytes(baseTs + 1, 260, 141)];

  const headerSize = 14;
  const header = [
    headerSize,
    0x10,
    0,
    0,
    data.length,
    0,
    0,
    0, // Datengroesse, uint32 LE
    0x2e,
    0x46,
    0x49,
    0x54, // ".FIT"
    0,
    0,
  ];
  const crc = [0, 0];

  return new Uint8Array([...header, ...data, ...crc]).buffer;
}

test('parseFit dekodiert eine minimale synthetische FIT-Datei', () => {
  const { points, startTime } = parseFit(buildMinimalFit());
  assert.equal(points.length, 2);
  assert.equal(points[0].t, 0);
  assert.equal(points[1].t, 1);
  assert.equal(points[0].watts, 250);
  assert.equal(points[1].watts, 260);
  assert.equal(points[0].heartrate, 140);
  assert.equal(points[1].heartrate, 141);
  assert.equal(points[0].deviceWatts, true);
  assert.ok(startTime);
  assert.equal(new Date(startTime).getTime(), Date.UTC(2026, 0, 1, 8, 0, 0));
});
