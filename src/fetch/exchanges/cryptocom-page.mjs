// Crypto.com App: no public fee API, so the fee table on its fee page is read (no key). Returns one row per coin and network the
// index tracks; a page that no longer parses throws, and fetch-exchanges then keeps the last good values and raises an alert.
import { saveRaw } from '../../lib/http.mjs';
export const PAGE = 'https://crypto.com/eea/fees-limits';
const NETWORKS = { 'ethereum (erc20)': 'ethereum', sol: 'solana', solana: 'solana', polygon: 'polygon', 'polygon (native usdc only)': 'polygon', 'arbitrum one': 'arbitrum', bsc: 'bsc', btc: 'bitcoin' };
const divs = (td) => [...td.matchAll(/<div>(.*?)<\/div>/gs)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
export function parseFeePage(html) {
  const rows = [];
  // BTC is tiered and the table only points to the tiers: the same figure as the sheet, the fee from 0.002 BTC up
  const btcTier = html.match(/&gt;=\s*0\.002 BTC<\/td>\s*<td[^>]*>([\d.]+)</)?.[1];
  for (const [tr] of html.matchAll(/<tr class="withdrawal-fee">.*?<\/tr>/gs)) {
    const tds = [...tr.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) => m[1]);
    if (tds.length < 5) continue;
    const asset = tds[1].match(/<div>([A-Z0-9]+)<\/div>/)?.[1], nets = divs(tds[2]), open = divs(tds[3]), fees = divs(tds[4]);
    if (!asset || nets.length !== open.length || nets.length !== fees.length) continue;
    nets.forEach((name, i) => {
      const network = NETWORKS[name.toLowerCase()]; if (!network) return;
      const fee = asset === 'BTC' && network === 'bitcoin' ? +btcTier : +fees[i];
      if (Number.isFinite(fee) && fee >= 0 && /^[YN]$/.test(open[i])) rows.push({ asset, network, fee, withdraw_enabled: open[i] === 'Y' });
    });
  }
  return rows;
}
export async function cryptocomPage() {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(PAGE, { headers: { 'user-agent': 'gcrypto-fee-index/0.1 (+https://crypto.gulfarcade.com)' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`crypto.com fee page: HTTP ${res.status}`);
    const rows = parseFeePage(await res.text());
    if (!rows.length) throw new Error('crypto.com fee page: the fee table could not be read');
    saveRaw('cryptocom-page', { observed_at: new Date().toISOString(), url: PAGE, status: res.status, response: rows });
    return rows;
  } finally { clearTimeout(tm); }
}
