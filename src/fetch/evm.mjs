// Ethereum, BNB Chain, Polygon, Arbitrum. Token transfer: (base fee + median tip) x gas measured by eth_estimateGas for a
// 100-unit transfer from a funded wallet (nothing is sent); fallback gas from config if the estimate fails (flagged).
// Native transfer (ETH, BNB, POL): a fixed 21,000 gas.
import { rpc, rawRef, hexNum } from '../lib/http.mjs';
export async function evm(net, asset, on) {
  const src = `evm-${net.id}-${asset.id}`;
  const fh = await rpc(`evm-${net.id}-feehistory`, net.rpc, 'eth_feeHistory', ['0x5', 'latest', [50, 90]]);
  const base = hexNum(fh.baseFeePerGas.at(-1)), tip = fh.reward && fh.reward.length ? hexNum(fh.reward.at(-1)[0]) : 0, tip90 = fh.reward && fh.reward.length ? hexNum(fh.reward.at(-1)[1]) : tip;
  let gasPrice = base + tip, gasPriceSrc = 'eth_feeHistory base + p50 tip';
  if (net.id === 'arbitrum' || gasPrice === 0) { gasPrice = hexNum(await rpc(`evm-${net.id}-gasprice`, net.rpc, 'eth_gasPrice')); gasPriceSrc = 'eth_gasPrice'; }
  let gas, gasNew = null, gasSrc, flags = [];
  if (on.native) { gas = 21000; gasSrc = 'plain transfer: 21,000 gas'; }
  else {
    gasSrc = 'eth_estimateGas';
    const amount = (100n * 10n ** BigInt(on.decimals)).toString(16).padStart(64, '0');
    try {
      gas = hexNum(await rpc(src + '-estimategas', net.rpc, 'eth_estimateGas', [{ from: on.from, to: on.contract, data: '0xa9059cbb' + '0'.repeat(24) + on.to + amount }]));
      if (gas > net.gas_fallback * 2 || gas < 20000) { flags.push('gas_estimate_out_of_range'); gas = net.gas_fallback; gasSrc = 'config fallback'; }
    } catch (e) { gas = net.gas_fallback; gasSrc = 'config fallback (' + e.message.slice(0, 60) + ')'; flags.push('gas_fallback_used'); }
    try { gasNew = hexNum(await rpc(src + '-estimategas-new', net.rpc, 'eth_estimateGas', [{ from: on.from, to: on.contract, data: '0xa9059cbb' + '0'.repeat(24) + '00000000000000000000000000000000000f3e4d' + amount }])); } catch { /* optional */ }
  }
  const fee = (gasPrice * gas) / 1e18, fast = ((base + tip90) * gas) / 1e18;
  return {
    fee_native: fee, flags,
    cases: on.native ? { fast_90th_pct_tip: fast } : { existing_recipient: fee, new_recipient: gasNew ? (gasPrice * gasNew) / 1e18 : null, fast_90th_pct_tip: fast },
    breakdown: { base_fee_gwei: base / 1e9, priority_tip_gwei: tip / 1e9, tip_90th_pct_gwei: tip90 / 1e9, gas_price_gwei: gasPrice / 1e9, gas_price_source: gasPriceSrc, gas, gas_new_recipient: gasNew, gas_source: gasSrc, note: net.id === 'arbitrum' ? 'estimateGas on Arbitrum includes the L1 data cost.' : '' },
    eta_min: Math.max(1, Math.round((net.block_time_s * net.confirmations.count) / 60)),
    source: `${net.rpc} (eth_feeHistory, ${on.native ? 'fixed 21,000 gas' : 'eth_estimateGas'})`, raw: [rawRef(`evm-${net.id}-feehistory`), ...(on.native ? [] : [rawRef(src + '-estimategas')])],
  };
}
