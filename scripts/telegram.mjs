// Telegram channel for the index: a daily digest (first run after 04:00 UTC = 08:00 Gulf) and instant alerts when a USDT
// network fee moves sharply. Runs inside the scheduled job after the data is written; without TELEGRAM_BOT_TOKEN it does
// nothing. `node scripts/telegram.mjs digest` forces a digest now; `setup` sets the bot's commands, description and menu button.
// State (what was posted when) lives in data/out/telegram-state.json, committed with the rest of data/.
import fs from 'node:fs';
if (fs.existsSync('.env')) for (const l of fs.readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const TOKEN = process.env.TELEGRAM_BOT_TOKEN, CHANNEL = process.env.TELEGRAM_CHANNEL || '@CryptoFeeIndex';
const SITE = 'https://crypto.gulfarcade.com';
const mode = process.argv[2] || 'auto';
if (!TOKEN) { console.log('telegram: no TELEGRAM_BOT_TOKEN, skipped'); process.exit(0); }

const api = async (method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`); return j.result;
};
const usd = (v) => new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 0.01 ? 4 : v < 1 ? 3 : 2 }).format(v);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STATE = 'data/out/telegram-state.json';
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE)) : { lastDigest: '', alerts: {} };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

const F = JSON.parse(fs.readFileSync('data/out/fees.json', 'utf8'));
const M = JSON.parse(fs.readFileSync('data/out/matrix.json', 'utf8'));
const A = F.assets.usdt, B = F.assets.btc;
const nets = Object.values(A.networks).filter((n) => n.fee_usd != null).sort((a, b) => a.fee_usd - b.fee_usd);
// cheapest exchange route for USDT: lowest withdrawal fee in USD across every exchange × network that is open
const routes = Object.entries(M.assets.usdt.exchanges).flatMap(([ex, e]) => Object.entries(e.cells).filter(([, c]) => c && c.enabled && c.fee_usd != null && !c.flags?.length).map(([n, c]) => ({ ex: e.name, net: F.networks[n]?.name ?? n, fee: c.fee, fee_usd: c.fee_usd }))).sort((a, b) => a.fee_usd - b.fee_usd);

function digestText() {
  const top = nets.slice(0, 3), tron = A.networks.tron, btc = B?.networks?.bitcoin, best = routes[0];
  const when = new Date(F.generated_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  // Arabic first, then English. The Arabic lines are placeholder wording for the translators to check.
  const ar = [
    `<b>رسوم إرسال USDT اليوم</b>`,
    ...top.map((n, i) => `${i + 1}. ${esc(n.name)}: <b>${usd(n.fee_usd)}</b>`),
    tron ? `Tron (TRC-20): <b>${usd(tron.fee_usd)}</b>` : null,
    best ? `أرخص سحب من منصة: ${esc(best.ex)} عبر ${esc(best.net)} بـ <b>${best.fee} USDT</b>` : null,
    btc ? `رسوم تحويل BTC: <b>${usd(btc.fee_usd)}</b>` : null,
  ].filter(Boolean).join('\n');
  const en = [
    `<b>Cost to send USDT today</b>`,
    ...top.map((n, i) => `${i + 1}. ${esc(n.name)}: <b>${usd(n.fee_usd)}</b>`),
    tron ? `Tron (TRC-20): <b>${usd(tron.fee_usd)}</b>` : null,
    best ? `Cheapest exchange withdrawal: ${esc(best.ex)} via ${esc(best.net)} at <b>${best.fee} USDT</b>` : null,
    btc ? `BTC transfer fee: <b>${usd(btc.fee_usd)}</b>` : null,
  ].filter(Boolean).join('\n');
  return `${ar}\n\n${en}\n\n<a href="${SITE}/ar/">${SITE}</a> · ${when}`;
}

// A sharp move: the USDT fee on a network is at least 50% away from where it was ~24 hours ago and the difference is
// more than 5 cents (so Solana going from $0.0005 to $0.0009 never fires). At most one alert per network per 6 hours.
function alerts() {
  if (!fs.existsSync('data/history/networks.csv')) return [];
  const rows = fs.readFileSync('data/history/networks.csv', 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const now = Date.parse(F.generated_at), out = [];
  for (const n of nets) {
    const past = rows.filter((r) => r[1] === 'usdt' && r[2] === n.network && Math.abs(Date.parse(r[0]) - (now - 24 * 3600e3)) < 3 * 3600e3).map((r) => +r[4]).filter((v) => v > 0);
    if (!past.length) continue;
    const ref = past.reduce((a, b) => a + b, 0) / past.length, diff = n.fee_usd - ref;
    if (Math.abs(diff) < 0.05 || Math.abs(diff) / ref < 0.5) continue;
    if (now - (state.alerts[n.network] || 0) < 6 * 3600e3) continue;
    const up = diff > 0;
    out.push({ network: n.network, text: `${up ? '🔺' : '🔻'} <b>${esc(n.name)}</b>\n` +
      `رسوم إرسال USDT ${up ? 'ارتفعت إلى' : 'انخفضت إلى'} <b>${usd(n.fee_usd)}</b> (كانت ${usd(ref)} قبل 24 ساعة)\n` +
      `USDT fee ${up ? 'up to' : 'down to'} <b>${usd(n.fee_usd)}</b> (was ${usd(ref)} 24h ago)\n` +
      `<a href="${SITE}/ar/networks/${n.network}/">${SITE}/ar/networks/${n.network}/</a>` });
  }
  return out;
}

async function post(text) { return api('sendMessage', { chat_id: CHANNEL, text, parse_mode: 'HTML', link_preview_options: { is_disabled: false, url: SITE + '/ar/', prefer_small_media: true } }); }

if (mode === 'setup') {
  // Bot profile: commands, descriptions in both languages, and the menu button that opens the site as a Mini App.
  await api('setMyCommands', { commands: [{ command: 'start', description: 'Live crypto fees · رسوم التحويل الآن' }] });
  await api('setMyDescription', { description: 'What it costs to send USDT, BTC, ETH, SOL and more right now on Tron, Ethereum, Solana and every major network, plus the cheapest exchange to withdraw from. Updated every 15 minutes. Free.\n\nتكلفة إرسال USDT وBTC وETH وSOL وغيرها الآن على Tron وEthereum وSolana وكل الشبكات الرئيسية، وأرخص منصة للسحب. يتحدث كل 15 دقيقة. مجاني.\n\nTap the menu button for live fees · اضغط زر القائمة للرسوم الآن\nA Gulf Arcade project' });
  await api('setMyShortDescription', { short_description: 'Live crypto transfer fees & cheapest exchange · رسوم التحويل الآن وأرخص منصة للسحب · crypto.gulfarcade.com' });
  await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Live fees · الرسوم', web_app: { url: SITE + '/ar/' } } });
  console.log('telegram: bot profile set');
} else if (mode === 'digest' || mode === 'auto') {
  const today = new Date().toISOString().slice(0, 10), hour = new Date().getUTCHours();
  if (mode === 'digest' || (state.lastDigest !== today && hour >= 4)) { await post(digestText()); state.lastDigest = today; save(); console.log('telegram: digest posted'); }
  else console.log('telegram: no digest due');
  if (mode === 'auto') for (const a of alerts()) { await post(a.text); state.alerts[a.network] = Date.now(); save(); console.log('telegram: alert posted', a.network); }
}
