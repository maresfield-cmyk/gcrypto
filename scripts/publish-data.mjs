// Before a site build: copy data/out/*.json to public/data/ (served as-is for the client-side refresh, the widgets and the
// Dataset links) and render the Open Graph images (hub + one per network) with sharp from an SVG template.
import fs from 'node:fs';
import sharp from 'sharp';
fs.mkdirSync('public/data', { recursive: true }); fs.mkdirSync('public/og', { recursive: true });
for (const f of ['networks.json', 'usdt-matrix.json', 'exchanges.json']) if (fs.existsSync(`data/out/${f}`)) fs.copyFileSync(`data/out/${f}`, `public/data/${f}`);
const N = JSON.parse(fs.readFileSync('data/out/networks.json'));
const usd = (v) => new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 0.01 ? 4 : v < 1 ? 3 : 2 }).format(v);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = (big, small, foot) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0b0f17"/><rect x="0" y="0" width="14" height="630" fill="#2dd4bf"/>
<text x="70" y="120" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#8b98a8" font-weight="600">Crypto Fee &amp; Transfer Index</text>
<text x="70" y="290" font-family="Helvetica, Arial, sans-serif" font-size="${big.length > 30 ? 60 : 76}" fill="#e6edf7" font-weight="800">${esc(big)}</text>
<text x="70" y="380" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#2dd4bf" font-weight="700">${esc(small)}</text>
<text x="70" y="560" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#8b98a8">${esc(foot)}</text></svg>`;
const when = N.generated_at.slice(0, 16).replace('T', ' ') + ' UTC';
const jobs = [['hub', svg('Cost to send USDT right now', (() => { const b = Object.values(N.networks).filter((n) => n.token === 'USDT' && n.fee_usd != null).sort((a, b) => a.fee_usd - b.fee_usd)[0]; return b ? `Cheapest: ${b.name} at ${usd(b.fee_usd)}` : ''; })(), `crypto.gulfarcade.com · ${when}`)]];
for (const n of Object.values(N.networks)) if (n.fee_usd != null) jobs.push([n.id, svg(`${n.name} ${n.token} fee right now: ${usd(n.fee_usd)}`, `${new Intl.NumberFormat('en', { maximumSignificantDigits: 4 }).format(n.fee_native)} ${n.native} · ~${n.eta_min} min to credit`, `crypto.gulfarcade.com · ${when}`)]);
for (const [name, s] of jobs) await sharp(Buffer.from(s)).png({ compressionLevel: 9 }).toFile(`public/og/${name}.png`);
console.log(`published ${jobs.length} OG images + data json`);
