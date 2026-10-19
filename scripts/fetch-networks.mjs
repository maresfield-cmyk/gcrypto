// Layer 1 run: fetch every network's fee, price it, validate, append history, write data/out/networks.json (+ sparklines).
// One failing source never fails the run: that network keeps its previous value, marked stale, and goes on the alert list.
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
const cfg = JSON.parse(fs.readFileSync(process.env.NETWORKS_CONFIG || 'config/networks.json'));   // NETWORKS_CONFIG: a test config (e.g. with a broken RPC)
const OUT = 'data/out/networks.json';
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : { networks: {} };
const FETCH = { tron, ethereum: evm, bsc: evm, polygon: evm, arbitrum: evm, solana, ton, bitcoin };
const now = new Date().toISOString();
const price = await prices(cfg.networks);
const history = readHistory();
const results = await Promise.allSettled(cfg.networks.map((n) => FETCH[n.id](n)));
const out = { generated_at: now, prices: price, networks: {}, alerts: [] };
const rows = [];
cfg.networks.forEach((n, i) => {
  const r = results[i], p = price.usd[n.coingecko], old = prev.networks[n.id];
  if (r.status === 'rejected' || !p) {
    const why = r.status === 'rejected' ? r.reason.message : 'no price';
    out.alerts.push({ network: n.id, type: 'source_failed', detail: why, at: now });
    if (old) out.networks[n.id] = { ...old, stale: true, stale_reason: why }; else out.networks[n.id] = { id: n.id, name: n.name, token: n.token, native: n.native, error: why, observed_at: now };
    return;
  }
  const s = r.value, snap = { id: n.id, name: n.name, token: n.token, native: n.native, observed_at: now, fee_native: s.fee_native, fee_usd: s.fee_native * p, price_usd: p, price_source: price.source, cases: s.cases || null, breakdown: s.breakdown, eta_min: s.eta_min, confirmations: n.confirmations, source: s.source, raw: s.raw, flags: s.flags || [] };
  if (snap.cases) snap.cases_usd = Object.fromEntries(Object.entries(snap.cases).map(([k, v]) => [k, typeof v === 'number' ? v * p : v && typeof v === 'object' && 'fee_trx' in v ? v.fee_trx * p : v]));
  snap.flags.push(...validate(n, snap, price, history, cfg));
  const bad = snap.flags.some((f) => /^anomaly|fee_above_cap|negative|price_stale/.test(f));
  if (bad) {
    out.alerts.push({ network: n.id, type: 'validation', detail: snap.flags.join(' '), value: snap.fee_usd, at: now });
    out.networks[n.id] = old ? { ...old, stale: true, stale_reason: snap.flags.join(' '), rejected: { fee_usd: snap.fee_usd, observed_at: now } } : { ...snap, stale: true };
  } else out.networks[n.id] = snap;
  rows.push({ ts: now, network: n.id, fee_native: snap.fee_native.toPrecision(6), fee_usd: snap.fee_usd.toFixed(6), price_usd: p, eta_min: snap.eta_min, flags: snap.flags.join('|') });
});
appendHistory(rows);
// 7-day sparklines (fee_usd per network, newest last) for the hub
const all = readHistory().filter((r) => Date.now() - Date.parse(r.ts) < 7 * 86400e3 && !r.flags);
out.sparklines_7d = Object.fromEntries(cfg.networks.map((n) => [n.id, all.filter((r) => r.network === n.id).map((r) => [r.ts, +r.fee_usd])]));
// did anything move enough to rebuild the site? (>5% on any network, or a new alert)
const moved = cfg.networks.filter((n) => { const a = prev.networks[n.id], b = out.networks[n.id]; return a && b && a.fee_usd > 0 && Math.abs(b.fee_usd - a.fee_usd) / a.fee_usd > 0.05; }).map((n) => n.id);
out.rebuild = { needed: moved.length > 0 || out.alerts.length > 0 || !prev.generated_at, moved };
fs.mkdirSync('data/out', { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync('data/out/alerts.json', JSON.stringify(out.alerts, null, 1));
for (const n of cfg.networks) { const x = out.networks[n.id]; console.log(`${n.id.padEnd(9)} ${x.error ? 'ERROR ' + x.error : `${x.fee_native.toPrecision(4).padEnd(10)} ${n.native.padEnd(4)} $${x.fee_usd.toFixed(4).padStart(8)}  eta ${String(x.eta_min).padStart(3)} min ${x.stale ? ' STALE: ' + x.stale_reason : ''}${x.flags && x.flags.length ? ' flags: ' + x.flags.join(',') : ''}`}`); }
console.log(`alerts: ${out.alerts.length}; rebuild needed: ${out.rebuild.needed} (${out.rebuild.moved.join(',') || 'first run / alert'}); wrote ${OUT}`);
