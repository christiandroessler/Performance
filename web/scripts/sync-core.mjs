// Kopiert core/src (M1, Rechenkern) nach web/vendor/core/src, damit das
// Frontend es als gewoehnliche statische ES-Module ausliefern kann.
//
// Warum eine Kopie statt eines Imports ueber Verzeichnisgrenzen: Cloudflares
// Static-Asset-Deploy liefert nur Dateien INNERHALB von web/ aus
// (assets.directory = "."); core/ liegt eine Ebene hoeher und waere sonst in
// Produktion nicht erreichbar. Vor jedem Deploy (oder nach Aenderungen an
// core/) erneut ausfuehren: `node scripts/sync-core.mjs`.

import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(webDir, '..', 'core', 'src');
const dest = path.join(webDir, 'vendor', 'core', 'src');

if (!existsSync(src)) {
  console.error(`Quelle nicht gefunden: ${src}`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`core/src -> ${path.relative(webDir, dest)} kopiert.`);
