// Layer 1 run: every asset on every network it lives on (config/assets.json x config/networks.json): fetch the fee, price it,
// validate, append history, write data/out/fees.json (+ sparklines). One failing source never fails the run: that cell keeps
// its previous value, marked stale, and goes on the alert list.
import fs from 'node:fs';
import { prices } from '../src/lib/prices.mjs';
import { validate } from '../src/lib/validate.mjs';
import { readHistory, appendHistory } from '../src/lib/history.mjs';
import { tron } from '../src/fetch/tron.mjs';
import { evm } from '../src/fetch/evm.mjs';
import { solana } from '../src/fetch/solana.mjs';
import { ton } from '../src/fetch/ton.mjs';
import { bitcoin } from '../src/fetch/bitcoin.mjs';
if (fs.existsSync('.env')) for (const l of fs.readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const cfg = JSON.parse(fs.readFileSync(process.env.NETWORKS_CONFIG || 'config/networks.json'));
const ASSETS = JSON.parse(fs.readFileSync('config/assets.json')).assets;
const OUT = 'data/out/fees.json';
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : { assets: {} };
const FETCH = { tron, ethereum: evm, bsc: evm, polygon: evm, arbitrum: evm, solana, ton, bitcoin };
const now = new Date().toISOString();
const price = await prices(cfg.networks, ASSETS.map((a) => a.coingecko));
const history = readHistory();
const netById = Object.fromEntries(cfg.networks.map((n) => [n.id, n]));
// jobs: one per (asset, network); the same chain's calls run one after another (TronGrid and tonapi rate-limit bursts)
const jobs = ASSETS.flatMap((a) => Object.entries(a.on).map(([nid, on]) => ({ a, n: netById[nid], on })));
const byChain = {}; for (const j of jobs) (byChain[j.n.id] ??= []).push(j);
const results = new Map();
await Promise.all(Object.values(byChain).map(async (list) => { for (const j of list) { try { results.set(j.a.id + ':' + j.n.id, { ok: true, v: await FETCH[j.n.id](j.n, j.a, j.on) }); } catch (e) { results.set(j.a.id + ':' + j.n.id, { ok: false, e }); } } }));
const out = { generated_at: now, prices: price, networks: Object.fromEntries(cfg.networks.map((n) => [n.id, { id: n.id, name: n.name, native: n.native, block_time_s: n.block_time_s, confirmations: n.confirmations }])), assets: {}, alerts: [] };
const rows = [];
for (const a of ASSETS) {
  out.assets[a.id] = { id: a.id, symbol: a.symbol, name: a.name, kind: a.kind, default: !!a.default, price_usd: price.usd[a.coingecko] ?? null, networks: {} };
  for (const nid of Object.keys(a.on)) {
    const n = netById[nid], key = a.id + ':' + nid, r = results.get(key), p = price.usd[n.coingecko], old = prev.assets[a.id]?.networks?.[nid];
    if (!r.ok || !p) {
      const why = !r.ok ? r.e.message : 'no price';
      out.alerts.push({ asset: a.id, network: nid, type: 'source_failed', detail: why, at: now });
      out.assets[a.id].networks[nid] = old ? { ...old, stale: true, stale_reason: why } : { asset: a.id, network: nid, error: why, observed_at: now };
      continue;
    }
    const s = r.v, snap = { asset: a.id, network: nid, name: n.name, native: n.native, observed_at: now, fee_native: s.fee_native, fee_usd: s.fee_native * p, price_usd: p, price_source: price.source, cases: s.cases || null, breakdown: s.breakdown, eta_min: s.eta_min, confirmations: n.confirmations, source: s.source, raw: s.raw, flags: s.flags || [] };
    if (snap.cases) snap.cases_usd = Object.fromEntries(Object.entries(snap.cases).map(([k, v]) => [k, typeof v === 'number' ? v * p : v]));
    snap.flags.push(...validate(n, a, snap, price, history, cfg));
    const bad = snap.flags.some((f) => /^anomaly|fee_above_cap|negative|price_stale/.test(f));
    if (bad) { out.alerts.push({ asset: a.id, network: nid, type: 'validation', detail: snap.flags.join(' '), value: snap.fee_usd, at: now }); out.assets[a.id].networks[nid] = old ? { ...old, stale: true, stale_reason: snap.flags.join(' '), rejected: { fee_usd: snap.fee_usd, observed_at: now } } : { ...snap, stale: true }; }
    else out.assets[a.id].networks[nid] = snap;
    rows.push({ ts: now, asset: a.id, network: nid, fee_native: snap.fee_native.toPrecision(6), fee_usd: snap.fee_usd.toFixed(6), price_usd: p, eta_min: snap.eta_min, flags: snap.flags.join('|') });
  }
}
appendHistory(rows);
const all = readHistory().filter((r) => Date.now() - Date.parse(r.ts) < 7 * 86400e3 && !r.flags);
out.sparklines_7d = {}; for (const r of all) (out.sparklines_7d[r.asset + ':' + r.network] ??= []).push([r.ts, +r.fee_usd]);
const moved = jobs.filter(({ a, n }) => { const x = prev.assets[a.id]?.networks?.[n.id], y = out.assets[a.id].networks[n.id]; return x && y && x.fee_usd > 0 && y.fee_usd != null && Math.abs(y.fee_usd - x.fee_usd) / x.fee_usd > 0.05; }).map(({ a, n }) => a.id + ':' + n.id);
out.rebuild = { needed: moved.length > 0 || out.alerts.length > 0 || !prev.generated_at, moved };
fs.mkdirSync('data/out', { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync('data/out/alerts.json', JSON.stringify(out.alerts, null, 1));
for (const a of ASSETS) for (const nid of Object.keys(a.on)) { const x = out.assets[a.id].networks[nid]; console.log(`${(a.symbol + ' on ' + nid).padEnd(18)} ${x.error ? 'ERROR ' + x.error : `${x.fee_native.toPrecision(4).padEnd(11)} ${netById[nid].native.padEnd(4)} $${x.fee_usd.toFixed(4).padStart(8)}  eta ${String(x.eta_min).padStart(3)} min${x.stale ? '  STALE: ' + x.stale_reason : ''}${x.flags && x.flags.length ? '  flags: ' + x.flags.join(',') : ''}`}`); }
console.log(`alerts: ${out.alerts.length}; rebuild needed: ${out.rebuild.needed} (${out.rebuild.moved.join(',') || 'first run / alert'}); wrote ${OUT}`);
