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
const ASSET_CFG = JSON.parse(fs.readFileSync('config/assets.json')).assets;
const ASSETS = ASSET_CFG.map((a) => a.symbol), OUT = 'data/out/exchanges.json', now = new Date().toISOString();
const CAP_USD = 60;                                        // sanity cap per row, in USD
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : { exchanges: {} };
const facts = YAML.parse(fs.readFileSync('data/manual/exchanges.yml', 'utf8')).exchanges;
const FEES = JSON.parse(fs.readFileSync('data/out/fees.json')), prices = FEES.prices.usd;
const priceOf = (sym) => { const a = ASSET_CFG.find((x) => x.symbol === sym); return a ? prices[a.coingecko] ?? null : null; };
const alerts = [], out = { generated_at: now, exchanges: {}, alerts };
const API = { kucoin, bitget, binance, bybit, okx };
// manual sheet
const csv = fs.readFileSync('data/manual/fees-manual.csv', 'utf8').trim().split('\n');
const head = csv[0].split(',');
const manual = csv.slice(1).map((l) => { const c = l.match(/("[^"]*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '')); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); });
for (const [ex, f] of Object.entries(facts)) {
  const rec = { id: ex, name: f.name, website: f.website, fee_source: f.fee_source, fee_page: f.fee_page, facts: { gulf_licensing: f.gulf_licensing, deposit_currencies: f.deposit_currencies, deposits: f.deposits || [], funding_source: f.funding_source || null, p2p: f.p2p, last_verified: f.last_verified || null }, rows: [], observed_at: now, stale: false };
  const viaApi = f.fee_source === 'api' || f.fee_source === 'api+manual' || (ex === 'cryptocom' && process.env.CRYPTOCOM_API_KEY);
  if (viaApi) {
    try {
      const rows = await API[ex](ASSETS);
      rec.rows = rows.map((r) => ({ ...r, observed_at: now, flags: validate(r) }));
    } catch (e) {
      const old = prev.exchanges[ex];
      if (e.noKey) { rec.rows = old ? old.rows : []; rec.stale = !!old; rec.note = 'API key not configured yet'; alerts.push({ exchange: ex, type: 'no_key', detail: e.message, at: now }); }
      else { rec.rows = old ? old.rows : []; rec.stale = true; rec.stale_reason = e.message; alerts.push({ exchange: ex, type: 'source_failed', detail: e.message, at: now }); }
    }
  }
  // Manual rows: the whole sheet for manual exchanges; for 'api+manual' only the asset/network cells the API did not return
  // (e.g. Bybit: our key is on the EU entity, whose list is shorter than what bybit.com offers Gulf users).
  if (!viaApi || f.fee_source === 'api+manual') {
    for (const m of manual.filter((r) => r.exchange === ex)) {
      if (viaApi && rec.rows.some((r) => r.asset === m.asset && r.network === m.network)) continue;
      const row = { exchange: ex, asset: m.asset, network: m.network, network_raw: m.network, fee: m.fee === '' || m.fee === 'network' ? null : +m.fee, pass_through: m.fee === 'network', fee_asset: m.fee_asset || m.asset, min: m.min === '' ? null : +m.min, withdraw_enabled: m.withdraw_enabled !== 'false', manual: true, last_verified: m.last_verified || null, source: m.source_url, notes: m.notes, observed_at: m.last_verified || null, flags: [] };
      if (!NETWORK_IDS.includes(row.network)) { unmapped.push({ exchange: ex, name: m.network }); continue; }
      if (row.fee == null && !row.pass_through) row.flags.push('not_filled_in');   // fee 'network' in the sheet = the exchange passes the live network fee through (no fixed figure)
      else row.flags.push(...validate(row));
      if (!row.last_verified) row.flags.push('never_verified');
      else if (Date.now() - Date.parse(row.last_verified) > 14 * 86400e3) { row.flags.push('manual_row_older_than_14d'); alerts.push({ exchange: ex, type: 'manual_stale', detail: `${m.asset} ${m.network} last verified ${m.last_verified}`, at: now }); }
      rec.rows.push(row);
    }
  }
  rec.rows = dedupe(rec.rows);
  for (const r of rec.rows) { r.fee_usd = r.fee == null || priceOf(r.fee_asset) == null ? null : r.fee * priceOf(r.fee_asset); if (r.fee_usd != null && r.fee_usd > CAP_USD) r.flags.push('fee_above_cap'); }
  out.exchanges[ex] = rec;
}
// an exchange can list one network twice (KuCoin: TON and TON2): keep the row that is open for withdrawals, then the cheapest
function dedupe(rows) { const m = new Map(); for (const r of rows) { const k = r.asset + '|' + r.network, o = m.get(k); if (!o || (r.withdraw_enabled && !o.withdraw_enabled) || (r.withdraw_enabled === o.withdraw_enabled && r.fee != null && (o.fee == null || r.fee < o.fee))) m.set(k, r); } return [...m.values()]; }
function validate(r) { const f = []; if (!(r.fee >= 0)) f.push('negative_or_missing_fee'); return f; }
if (unmapped.length) alerts.push({ type: 'unmapped_network_names', detail: unmapped.map((u) => `${u.exchange}: "${u.name}"`).join('; '), at: now });
fs.writeFileSync('data/out/unmapped.json', JSON.stringify(unmapped, null, 1));
// one matrix per asset: exchange x network -> fee (in the asset), min, enabled; null = not offered / unknown
const matrix = { generated_at: now, assets: {} };
for (const a of ASSET_CFG) {
  const nets = Object.keys(a.on);
  const m = { symbol: a.symbol, name: a.name, networks: nets, exchanges: {} };
  for (const [ex, rec] of Object.entries(out.exchanges)) {
    m.exchanges[ex] = { name: rec.name, stale: rec.stale, note: rec.note || rec.stale_reason || null, fee_source: rec.fee_source, cells: Object.fromEntries(nets.map((n) => { const r = rec.rows.find((x) => x.asset === a.symbol && x.network === n); return [n, r ? { fee: r.fee, fee_usd: r.fee_usd, min: r.min, pass_through: !!r.pass_through, enabled: r.withdraw_enabled, flags: r.flags, last_verified: r.last_verified || r.observed_at } : null]; })) };
  }
  m.cheapest_per_network = Object.fromEntries(nets.map((n) => { const c = Object.entries(m.exchanges).map(([ex, e]) => [ex, e.cells[n]]).filter(([, v]) => v && v.enabled && v.fee != null && !v.flags.length).sort((x, y) => x[1].fee - y[1].fee); return [n, c.length ? { exchange: c[0][0], fee: c[0][1].fee, fee_usd: c[0][1].fee_usd } : null]; }));
  matrix.assets[a.id] = m;
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync('data/out/matrix.json', JSON.stringify(matrix, null, 1));
fs.writeFileSync('data/out/alerts-exchanges.json', JSON.stringify(alerts, null, 1));
// console summary
for (const [aid, m] of Object.entries(matrix.assets)) {
  console.log(`\n${m.symbol} withdrawal fees (in ${m.symbol}; - = not offered; ? = not filled in; * = stale/no key):`);
  console.log('exchange  '.padEnd(11) + m.networks.map((n) => n.slice(0, 8).padStart(9)).join(''));
  for (const [ex, e] of Object.entries(m.exchanges)) console.log((ex + (e.stale ? '*' : '')).padEnd(11) + m.networks.map((n) => { const v = e.cells[n]; return (v == null ? '-' : v.fee == null ? (v.pass_through ? 'net' : '?') : (v.enabled ? '' : '(off)') + String(v.fee)).padStart(9); }).join(''));
}
console.log('\nunmapped names:', unmapped.length ? JSON.stringify(unmapped) : 'none');
console.log('alerts:', alerts.length, alerts.map((a) => a.type + (a.exchange ? ':' + a.exchange : '')).join(', '));
