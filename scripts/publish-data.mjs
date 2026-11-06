// Before a site build: copy data/out/*.json to public/data/ (served as-is for the client-side refresh, the widgets and the
// Dataset links) and render the Open Graph images (hub + one per network) with sharp from an SVG template.
import fs from 'node:fs';
import sharp from 'sharp';
fs.mkdirSync('public/data', { recursive: true }); fs.mkdirSync('public/og', { recursive: true });
for (const f of ['fees.json', 'matrix.json', 'exchanges.json']) if (fs.existsSync(`data/out/${f}`)) fs.copyFileSync(`data/out/${f}`, `public/data/${f}`);
const F = JSON.parse(fs.readFileSync('data/out/fees.json'));

// ticker.json (Patrick, 6 Nov): the small feed behind the fee strip on the gulfarcade.com homepage. USDT and BTC only:
// own-wallet network fee now and about 24 h ago per network, plus each exchange's withdrawal fee and minimum. pass = the
// exchange has no fixed fee and passes the live network fee through. BTC on BNB Chain is a BEP-20 token, so its gas is
// taken as USDT's on BNB Chain. Served with GitHub Pages' open CORS header so the homepage can read it.
// Never allowed to stop this build: on any error the file is skipped (the strip then hides itself after 24 h).
try {
  const M = JSON.parse(fs.readFileSync('data/out/matrix.json'));
  const spark = F.sparklines_7d || {};
  const ago = (key) => { const s = spark[key]; if (!s?.length) return null; const t = Date.parse(F.generated_at) - 864e5;
    let best = null; for (const [at, v] of s) { const d = Math.abs(Date.parse(at) - t); if (d < 2 * 36e5 && (!best || d < best.d)) best = { d, v }; } return best ? +best.v.toFixed(6) : null; };
  const net = (asset, n, key = `${asset}:${n}`) => { const x = F.assets[asset]?.networks?.[n]; return x?.fee_usd == null ? null : [+x.fee_usd.toFixed(6), ago(key)]; };
  const wallet = { usdt: {}, btc: {} };
  for (const n of Object.keys(F.assets.usdt.networks)) { const v = net('usdt', n); if (v) wallet.usdt[n] = v; }
  if (net('btc', 'bitcoin')) wallet.btc.bitcoin = net('btc', 'bitcoin');
  if (wallet.usdt.bsc) wallet.btc.bsc = wallet.usdt.bsc;
  const cells = (a) => Object.fromEntries(Object.entries(a?.cells || {}).filter(([, c]) => c && c.enabled && (c.fee != null || c.pass_through))
    .map(([n, c]) => [n, { fee: c.pass_through ? null : c.fee, min: c.min, pass: !!c.pass_through }]));
  const exchanges = Object.entries(M.assets.usdt.exchanges).map(([id, e]) => ({ id, name: e.name, usdt: cells(e), btc: cells(M.assets.btc.exchanges[id]) }));
  const T = { generated_at: F.generated_at, exchanges_at: M.generated_at, price: { usdt: F.assets.usdt.price_usd, btc: F.assets.btc.price_usd }, wallet, exchanges };
  fs.writeFileSync('public/data/ticker.json', JSON.stringify(T));
} catch (e) { console.error('ticker.json skipped:', e.message); }
const usd = (v) => new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 0.01 ? 4 : v < 1 ? 3 : 2 }).format(v);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const LOGO = 'data:image/png;base64,' + fs.readFileSync('public/logo-192.png').toString('base64');
const svg = (big, small, foot) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0b0f17"/><rect x="0" y="0" width="14" height="630" fill="#2dd4bf"/>
<image href="${LOGO}" x="70" y="70" width="72" height="72"/><text x="162" y="120" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#8b98a8" font-weight="600">Crypto Fee &amp; Transfer Index</text>
<text x="70" y="290" font-family="Helvetica, Arial, sans-serif" font-size="${big.length > 40 ? 48 : big.length > 30 ? 60 : 76}" fill="#e6edf7" font-weight="800">${esc(big)}</text>
<text x="70" y="380" font-family="Helvetica, Arial, sans-serif" font-size="${small.length > 60 ? 26 : small.length > 45 ? 32 : 40}" fill="#2dd4bf" font-weight="700">${esc(small)}</text>
<text x="70" y="560" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#8b98a8">${esc(foot)}</text></svg>`;
const when = F.generated_at.slice(0, 16).replace('T', ' ') + ' UTC';
const cheapest = (a) => Object.values(a.networks).filter((n) => n.fee_usd != null).sort((x, y) => x.fee_usd - y.fee_usd)[0];
const T = JSON.parse(fs.readFileSync('locales/en.json', 'utf8')); // share-image wording (English for now; Arabic images come with the /ar/ phase)
const tt = (k, v) => T[k].replace(/\{(\w+)\}/g, (_, n) => v[n]);
const jobs = [];
jobs.push(['default', svg(T['site.name'], T['og.default_small'], `crypto.gulfarcade.com · ${when}`)]);
jobs.push(['calc', svg(T['calc.title'], T['og.calc_small'], `crypto.gulfarcade.com · ${when}`)]);
for (const a of Object.values(F.assets)) { const b = cheapest(a); jobs.push([a.id, svg(tt('og.cost', { asset: a.symbol }), b ? tt('og.cheapest', { network: b.name, fee: usd(b.fee_usd) }) : '', `crypto.gulfarcade.com · ${when}`)]); }
const D = Object.values(F.assets).find((a) => a.default);
const seen = new Set();
for (const a of [D, ...Object.values(F.assets).filter((x) => x !== D)]) for (const n of Object.values(a.networks)) if (n.fee_usd != null && !seen.has(n.network) && seen.add(n.network)) jobs.push(['net-' + n.network, svg(tt('og.net', { network: n.name, asset: a.symbol, fee: usd(n.fee_usd) }), `${new Intl.NumberFormat('en', { maximumSignificantDigits: 4 }).format(n.fee_native)} ${n.native} · ~${n.eta_min} min to credit`, `crypto.gulfarcade.com · ${when}`)]);
for (const [name, s] of jobs) await sharp(Buffer.from(s)).png({ compressionLevel: 9 }).toFile(`public/og/${name}.png`);
console.log(`published ${jobs.length} OG images + data json`);
