// Layer 2 run: withdrawal fees and minimums for USDT and BTC from every exchange (API where possible, the manual sheet
// otherwise), network names normalised, validated, written to data/out/exchanges.json and data/out/usdt-matrix.json.
// An exchange without a key or with a failing API keeps its previous rows (marked stale); unmapped names go to
// data/out/unmapped.json and the alert list. Manual rows older than 14 days are flagged.
import fs from 'node:fs';
import YAML from 'yaml';
import { kucoin } from '../src/fetch/exchanges/kucoin.mjs';
import { bitget } from '../src/fetch/exchanges/bitget.mjs';
import { binance } from '../src/fetch/exchanges/binance.mjs';
import { bybit } from '../src/fetch/exchanges/bybit.mjs';
import { okx } from '../src/fetch/exchanges/okx.mjs';
import { unmapped, NETWORK_IDS } from '../src/lib/normalise.mjs';
if (fs.existsSync('.env')) for (const l of fs.readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const ASSETS = ['USDT', 'BTC'], OUT = 'data/out/exchanges.json', now = new Date().toISOString();
const CAP = { USDT: 50, BTC: 0.01 };                       // sanity caps per asset
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : { exchanges: {} };
const facts = YAML.parse(fs.readFileSync('data/manual/exchanges.yml', 'utf8')).exchanges;
const net = JSON.parse(fs.readFileSync('data/out/networks.json')).networks;   // for USD conversion of BTC fees
const prices = JSON.parse(fs.readFileSync('data/out/networks.json')).prices.usd;
const alerts = [], out = { generated_at: now, exchanges: {}, alerts };
const API = { kucoin, bitget, binance, bybit, okx };
// manual sheet
const csv = fs.readFileSync('data/manual/fees-manual.csv', 'utf8').trim().split('\n');
const head = csv[0].split(',');
const manual = csv.slice(1).map((l) => { const c = l.match(/("[^"]*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '')); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); });
for (const [ex, f] of Object.entries(facts)) {
  const rec = { id: ex, name: f.name, website: f.website, fee_source: f.fee_source, fee_page: f.fee_page, facts: { gulf_licensing: f.gulf_licensing, deposit_currencies: f.deposit_currencies, p2p: f.p2p, last_verified: f.last_verified || null }, rows: [], observed_at: now, stale: false };
  if (f.fee_source === 'api' || (ex === 'cryptocom' && process.env.CRYPTOCOM_API_KEY)) {
    try {
      const rows = await API[ex](ASSETS);
      rec.rows = rows.map((r) => ({ ...r, observed_at: now, flags: validate(r) }));
    } catch (e) {
      const old = prev.exchanges[ex];
      if (e.noKey) { rec.rows = old ? old.rows : []; rec.stale = !!old; rec.note = 'API key not configured yet'; alerts.push({ exchange: ex, type: 'no_key', detail: e.message, at: now }); }
      else { rec.rows = old ? old.rows : []; rec.stale = true; rec.stale_reason = e.message; alerts.push({ exchange: ex, type: 'source_failed', detail: e.message, at: now }); }
    }
  } else {
    for (const m of manual.filter((r) => r.exchange === ex)) {
      const row = { exchange: ex, asset: m.asset, network: m.network, network_raw: m.network, fee: m.fee === '' ? null : +m.fee, fee_asset: m.fee_asset || m.asset, min: m.min === '' ? null : +m.min, withdraw_enabled: m.withdraw_enabled !== 'false', manual: true, last_verified: m.last_verified || null, source: m.source_url, notes: m.notes, observed_at: m.last_verified || null, flags: [] };
      if (!NETWORK_IDS.includes(row.network)) { unmapped.push({ exchange: ex, name: m.network }); continue; }
      if (row.fee == null) row.flags.push('not_filled_in');
      else row.flags.push(...validate(row));
      if (!row.last_verified) row.flags.push('never_verified');
      else if (Date.now() - Date.parse(row.last_verified) > 14 * 86400e3) { row.flags.push('manual_row_older_than_14d'); alerts.push({ exchange: ex, type: 'manual_stale', detail: `${m.asset} ${m.network} last verified ${m.last_verified}`, at: now }); }
      rec.rows.push(row);
    }
  }
  rec.rows = dedupe(rec.rows);
  for (const r of rec.rows) r.fee_usd = r.fee == null ? null : r.fee_asset === 'USDT' ? r.fee : r.fee_asset === 'BTC' ? r.fee * (prices.bitcoin || 0) : null;
  out.exchanges[ex] = rec;
}
// an exchange can list one network twice (KuCoin: TON and TON2): keep the row that is open for withdrawals, then the cheapest
function dedupe(rows) { const m = new Map(); for (const r of rows) { const k = r.asset + '|' + r.network, o = m.get(k); if (!o || (r.withdraw_enabled && !o.withdraw_enabled) || (r.withdraw_enabled === o.withdraw_enabled && r.fee != null && (o.fee == null || r.fee < o.fee))) m.set(k, r); } return [...m.values()]; }
function validate(r) { const f = []; if (!(r.fee >= 0)) f.push('negative_or_missing_fee'); if (r.fee > (CAP[r.fee_asset] ?? 50)) f.push('fee_above_cap'); return f; }
if (unmapped.length) alerts.push({ type: 'unmapped_network_names', detail: unmapped.map((u) => `${u.exchange}: "${u.name}"`).join('; '), at: now });
fs.writeFileSync('data/out/unmapped.json', JSON.stringify(unmapped, null, 1));
// USDT matrix: exchange x network -> fee (USDT), min, enabled; null = not offered / unknown
const trackedNets = Object.keys(net).filter((n) => net[n].token === 'USDT');
const matrix = { generated_at: now, networks: trackedNets, exchanges: {} };
for (const [ex, rec] of Object.entries(out.exchanges)) {
  matrix.exchanges[ex] = { name: rec.name, stale: rec.stale, note: rec.note || rec.stale_reason || null, fee_source: rec.fee_source, cells: Object.fromEntries(trackedNets.map((n) => { const r = rec.rows.find((x) => x.asset === 'USDT' && x.network === n); return [n, r ? { fee: r.fee, min: r.min, enabled: r.withdraw_enabled, flags: r.flags, last_verified: r.last_verified || r.observed_at } : null]; })) };
}
// cheapest exchange per network (enabled, valid, filled-in rows only)
matrix.cheapest_per_network = Object.fromEntries(trackedNets.map((n) => { const c = Object.entries(matrix.exchanges).map(([ex, e]) => [ex, e.cells[n]]).filter(([, v]) => v && v.enabled && v.fee != null && !v.flags.length).sort((a, b) => a[1].fee - b[1].fee); return [n, c.length ? { exchange: c[0][0], fee: c[0][1].fee } : null]; }));
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync('data/out/usdt-matrix.json', JSON.stringify(matrix, null, 1));
fs.writeFileSync('data/out/alerts-exchanges.json', JSON.stringify(alerts, null, 1));
// console summary
console.log('USDT withdrawal fee matrix (fee in USDT; - = not offered; ? = not filled in; * = stale/no key):');
console.log('exchange  '.padEnd(11) + trackedNets.map((n) => n.slice(0, 8).padStart(9)).join(''));
for (const [ex, e] of Object.entries(matrix.exchanges)) console.log((ex + (e.stale || e.fee_source === 'manual' && !e.cells ? '*' : '')).padEnd(11) + trackedNets.map((n) => { const v = e.cells[n]; return (v == null ? '-' : v.fee == null ? '?' : (v.enabled ? '' : '(off)') + String(v.fee)).padStart(9); }).join('') + (e.stale ? '  * ' + e.note : ''));
console.log('\ncheapest per network:', JSON.stringify(matrix.cheapest_per_network));
console.log('unmapped names:', unmapped.length ? JSON.stringify(unmapped) : 'none');
console.log('alerts:', alerts.length, alerts.map((a) => a.type + (a.exchange ? ':' + a.exchange : '')).join(', '));
