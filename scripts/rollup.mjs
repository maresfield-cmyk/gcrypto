// Thin data/history/networks.csv: keep every 15-min row for 30 days, one row per hour for a year, one per day beyond that.
import fs from 'node:fs';
import { readHistory, HISTORY_FILE, HISTORY_HEAD } from '../src/lib/history.mjs';
const rows = readHistory(), keep = [], seen = new Set();
for (const r of rows) {
  const age = Date.now() - Date.parse(r.ts);
  const bucket = age < 30 * 86400e3 ? r.ts : age < 365 * 86400e3 ? r.ts.slice(0, 13) : r.ts.slice(0, 10);
  const k = r.asset + '|' + r.network + '|' + bucket; if (seen.has(k)) continue; seen.add(k); keep.push(r);
}
fs.writeFileSync(HISTORY_FILE, HISTORY_HEAD + '\n' + keep.map((r) => [r.ts, r.asset, r.network, r.fee_native, r.fee_usd, r.price_usd, r.eta_min, r.flags].join(',')).join('\n') + '\n');
console.log(`history: ${rows.length} rows -> ${keep.length}`);
