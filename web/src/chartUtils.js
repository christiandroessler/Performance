// Reine Hilfsfunktionen fuer die Chart-Darstellung, ohne Browser-Abhaengigkeit
// (getrennt von activityDetailView.js, das transitiv `window` braucht, damit
// dies mit node:test ohne DOM/Browser-Shim testbar bleibt).

/** Bucket-Groesse (in Sekunden bei 1-Hz-Quellarrays), die downsample() fuer ein Array dieser Laenge verwendet - fuer
 *  Hover-Tooltips gebraucht, um den Index einer downgesampelten Stuetzstelle auf die reale Sekunde im Training
 *  zurueckzurechnen (muss exakt dieselbe Formel wie downsample() verwenden, sonst laufen Werte/Zeit auseinander). */
export function downsampledBucketSize(originalLength, maxPoints = 500) {
  return originalLength <= maxPoints ? 1 : Math.ceil(originalLength / maxPoints);
}

/** Reduziert lange Sekunden-Arrays auf max. maxPoints Stuetzpunkte (Mittelwert je Bucket). */
export function downsample(arr, maxPoints = 500) {
  const n = arr.length;
  if (n <= maxPoints) return Array.from(arr);
  const bucketSize = downsampledBucketSize(n, maxPoints);
  const out = [];
  for (let i = 0; i < n; i += bucketSize) {
    let sum = 0;
    let count = 0;
    for (let j = i; j < Math.min(i + bucketSize, n); j++) {
      sum += arr[j];
      count++;
    }
    out.push(count > 0 ? sum / count : 0);
  }
  return out;
}
