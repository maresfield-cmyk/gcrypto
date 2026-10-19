// TON. Jetton (USDT): what senders actually paid: the latest transactions on the jetton master, each one's trace (the whole
// chain of messages of that transfer) summed; median of the sample. Native TON: the median total fee of plain transfers
// (no message body) in the latest basechain block. The forward TON a wallet attaches to a jetton transfer is mostly refunded
// and excluded.
import { getJson, rawRef, sleep } from '../lib/http.mjs';
const H = () => (process.env.TONAPI_KEY ? { authorization: `Bearer ${process.env.TONAPI_KEY}` } : {});
const wait = () => sleep(process.env.TONAPI_KEY ? 150 : 1100);
function sumFees(node) { let s = Number(node.transaction && node.transaction.total_fees || 0); for (const c of node.children || []) s += sumFees(c); return s; }
const median = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
export async function ton(net, asset, on) {
  if (on.native) {
    // sender-side plain transfers (a wallet's external message producing one internal transfer with no body), from the latest
    // blocks of every shard until there are enough samples
    const head = await getJson('ton-head', 'https://tonapi.io/v2/blockchain/masterchain-head', { headers: H() }); await wait();
    const fees = [];
    for (let back = 0; back < 10 && fees.length < 6; back++) {
      const shards = await getJson('ton-shards', `https://tonapi.io/v2/blockchain/masterchain/${head.seqno - back}/shards`, { headers: H() }); await wait();
      for (const s of shards.shards) {
        const txs = await getJson('ton-block-txs', `https://tonapi.io/v2/blockchain/blocks/${s.last_known_block_id}/transactions`, { headers: H() }); await wait();
        for (const t of txs.transactions || []) if (t.in_msg && t.in_msg.msg_type === 'ext_in_msg' && t.success && t.out_msgs && t.out_msgs.length === 1 && t.out_msgs[0].msg_type === 'int_msg' && !t.out_msgs[0].decoded_op_name && (t.out_msgs[0].value || 0) > 0) fees.push(Number(t.total_fees));
      }
    }
    if (fees.length < 3) throw new Error(`ton native: only ${fees.length} plain transfers in the latest 10 blocks`);
    const med = median(fees);
    return { fee_native: med / 1e9, breakdown: { transfers_sampled: fees.length, fee_ton_min: Math.min(...fees) / 1e9, fee_ton_median: med / 1e9, note: 'Median fee paid by senders of plain TON transfers in the latest blocks.' }, eta_min: 1, source: 'https://tonapi.io/v2 (blockchain/blocks/{id}/transactions)', raw: [rawRef('ton-block-txs')] };
  }
  const txs = (await getJson('ton-master-txs', `https://tonapi.io/v2/blockchain/accounts/${on.master}/transactions?limit=${net.traces_sample * 2}`, { headers: H() })).transactions;
  const fees = [];
  for (const t of txs.slice(0, net.traces_sample * 2)) {
    if (fees.length >= net.traces_sample) break;
    try { await wait(); const tr = await getJson('ton-trace', `https://tonapi.io/v2/traces/${t.hash}`, { headers: H() }); const f = sumFees(tr); if (f > 0) fees.push(f); } catch { /* skip this trace */ }
  }
  if (fees.length < 3) throw new Error(`ton: only ${fees.length} usable traces`);
  const med = median(fees);
  return { fee_native: med / 1e9, breakdown: { traces_sampled: fees.length, fee_ton_min: fees[0] / 1e9, fee_ton_median: med / 1e9, fee_ton_max: fees.at(-1) / 1e9, note: 'Sum of all network fees across one real transfer (median of recent transfers). Wallets also attach ~0.05 TON that is mostly refunded.' }, eta_min: 1, source: 'https://tonapi.io/v2 (blockchain/accounts/{jetton master}/transactions, traces/{hash})', raw: [rawRef('ton-master-txs'), rawRef('ton-trace')] };
}
