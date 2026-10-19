// data/history/networks.csv: one row per snapshot per asset x network, append-only (scripts/rollup.mjs thins old rows).
import fs from 'node:fs';
const FILE = 'data/history/networks.csv', HEAD = 'ts,asset,network,fee_native,fee_usd,price_usd,eta_min,flags';
export function readHistory() {
  if (!fs.existsSync(FILE)) return [];
  return fs.readFileSync(FILE, 'utf8').trim().split('\n').slice(1).filter(Boolean).map((l) => { const [ts, asset, network, fee_native, fee_usd, price_usd, eta_min, flags] = l.split(','); return { ts, asset, network, fee_native, fee_usd, price_usd, eta_min, flags }; });
}
export function appendHistory(rows) {
  fs.mkdirSync('data/history', { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, HEAD + '\n');
  fs.appendFileSync(FILE, rows.map((r) => [r.ts, r.asset, r.network, r.fee_native, r.fee_usd, r.price_usd, r.eta_min, r.flags].join(',') + '\n').join(''));
}
export const HISTORY_FILE = FILE, HISTORY_HEAD = HEAD;
