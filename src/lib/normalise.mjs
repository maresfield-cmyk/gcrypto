// Map an exchange's network name to our network id. Unknown names are returned as null and recorded (fail loudly later).
import fs from 'node:fs';
const MAP = JSON.parse(fs.readFileSync('config/network-map.json'));
const lookup = new Map(), ignore = new Set(MAP.ignore.map((s) => s.trim().toLowerCase()));
for (const [id, names] of Object.entries(MAP.aliases)) for (const n of names) lookup.set(n.trim().toLowerCase(), id);
export const unmapped = [];
export function networkId(exchange, rawName) {
  const k = String(rawName || '').trim().toLowerCase();
  if (lookup.has(k)) return lookup.get(k);
  if (ignore.has(k)) return 'ignore';
  unmapped.push({ exchange, name: rawName });
  return null;
}
export const NETWORK_IDS = MAP.ids;
