// TON USDT (jetton): what senders actually paid. Take the latest transactions on the USDT jetton master, follow each one's
// trace (the whole chain of messages of that transfer) and sum the network fees of every transaction in it; report the median.
// The forward TON a wallet attaches (often 0.05 TON) is mostly returned, so it is not a fee and is excluded.
import { getJson, rawRef, sleep } from '../lib/http.mjs';
const H = () => (process.env.TONAPI_KEY ? { authorization: `Bearer ${process.env.TONAPI_KEY}` } : {});
function sumFees(node) { let s = Number(node.transaction && node.transaction.total_fees || 0); for (const c of node.children || []) s += sumFees(c); return s; }
export async function ton(net) {
  const txs = (await getJson('ton-master-txs', `https://tonapi.io/v2/blockchain/accounts/${net.usdt_master}/transactions?limit=${net.traces_sample * 2}`, { headers: H() })).transactions;
  const fees = [];
  for (const t of txs.slice(0, net.traces_sample * 2)) {
    if (fees.length >= net.traces_sample) break;
    try { await sleep(process.env.TONAPI_KEY ? 150 : 1100); const tr = await getJson('ton-trace', `https://tonapi.io/v2/traces/${t.hash}`, { headers: H() }); const f = sumFees(tr); if (f > 0) fees.push(f); } catch { /* skip this trace */ }
  }
  if (fees.length < 3) throw new Error(`ton: only ${fees.length} usable traces`);
  fees.sort((a, b) => a - b);
  const med = fees[Math.floor(fees.length / 2)];
  return {
    fee_native: med / 1e9,
    breakdown: { traces_sampled: fees.length, fee_ton_min: fees[0] / 1e9, fee_ton_median: med / 1e9, fee_ton_max: fees.at(-1) / 1e9, note: 'Sum of all network fees across one real USDT transfer (median of recent transfers). Wallets also attach ~0.05 TON that is mostly refunded.' },
    eta_min: 1,
    source: 'https://tonapi.io/v2 (blockchain/accounts/{USDT master}/transactions, traces/{hash})', raw: [rawRef('ton-master-txs'), rawRef('ton-trace')],
  };
}
