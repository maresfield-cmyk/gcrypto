// Before a site build: copy data/out/*.json to public/data/ (served as-is for the client-side refresh, the widgets and the
// Dataset links) and render the Open Graph images (hub + one per network) with sharp from an SVG template.
import fs from 'node:fs';
import sharp from 'sharp';
fs.mkdirSync('public/data', { recursive: true }); fs.mkdirSync('public/og', { recursive: true });
for (const f of ['fees.json', 'matrix.json', 'exchanges.json']) if (fs.existsSync(`data/out/${f}`)) fs.copyFileSync(`data/out/${f}`, `public/data/${f}`);
const F = JSON.parse(fs.readFileSync('data/out/fees.json'));
const usd = (v) => new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 0.01 ? 4 : v < 1 ? 3 : 2 }).format(v);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const LOGO = 'data:image/png;base64,' + fs.readFileSync('public/logo-192.png').toString('base64');
const svg = (big, small, foot) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0b0f17"/><rect x="0" y="0" width="14" height="630" fill="#2dd4bf"/>
<image href="${LOGO}" x="70" y="70" width="72" height="72"/><text x="162" y="120" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#8b98a8" font-weight="600">Crypto Fee &amp; Transfer Index</text>
<text x="70" y="290" font-family="Helvetica, Arial, sans-serif" font-size="${big.length > 30 ? 60 : 76}" fill="#e6edf7" font-weight="800">${esc(big)}</text>
<text x="70" y="380" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#2dd4bf" font-weight="700">${esc(small)}</text>
<text x="70" y="560" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#8b98a8">${esc(foot)}</text></svg>`;
const when = F.generated_at.slice(0, 16).replace('T', ' ') + ' UTC';
const cheapest = (a) => Object.values(a.networks).filter((n) => n.fee_usd != null).sort((x, y) => x.fee_usd - y.fee_usd)[0];
const jobs = [];
for (const a of Object.values(F.assets)) { const b = cheapest(a); jobs.push([a.id, svg(`Cost to send ${a.symbol} right now`, b ? `Cheapest: ${b.name} at ${usd(b.fee_usd)}` : '', `crypto.gulfarcade.com · ${when}`)]); }
const D = Object.values(F.assets).find((a) => a.default);
for (const n of Object.values(D.networks)) if (n.fee_usd != null) jobs.push(['net-' + n.network, svg(`${n.name} ${D.symbol} fee right now: ${usd(n.fee_usd)}`, `${new Intl.NumberFormat('en', { maximumSignificantDigits: 4 }).format(n.fee_native)} ${n.native} · ~${n.eta_min} min to credit`, `crypto.gulfarcade.com · ${when}`)]);
for (const [name, s] of jobs) await sharp(Buffer.from(s)).png({ compressionLevel: 9 }).toFile(`public/og/${name}.png`);
console.log(`published ${jobs.length} OG images + data json`);
