// Ethereum, BNB Chain, Polygon, Arbitrum: fee = (base fee + median priority tip) x gas, gas measured by eth_estimateGas for a
// 100 USDT transfer from a funded wallet (nothing is sent). Where estimateGas fails, gas_fallback from config is used and flagged.
import { rpc, rawRef, hexNum } from '../lib/http.mjs';
// A wallet that holds USDT on each chain (Binance hot wallets): used only for gas estimation, nothing is ever sent
const FROM = { ethereum: '0xF977814e90dA44bFA03b6295A0616a897441aceC', bsc: '0xF977814e90dA44bFA03b6295A0616a897441aceC', polygon: '0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245', arbitrum: '0xF977814e90dA44bFA03b6295A0616a897441aceC' };
const TO = { ethereum: '28c6c06298d514db089934071355e5743bf21d60', bsc: '8894e0a0c962cb723c1976a4421c95949be2d4e3', polygon: 'f89d7b9c864f589bbf53a82105107622b35eaa40', arbitrum: 'b38e8c17e38363af6ebdcb3dae12e0243582891d' };
export async function evm(net) {
  const src = `evm-${net.id}`;
  const fh = await rpc(src + '-feehistory', net.rpc, 'eth_feeHistory', ['0x5', 'latest', [50, 90]]);
  const base = hexNum(fh.baseFeePerGas.at(-1)), tip = fh.reward && fh.reward.length ? hexNum(fh.reward.at(-1)[0]) : 0, tip90 = fh.reward && fh.reward.length ? hexNum(fh.reward.at(-1)[1]) : tip;
  let gasPrice = base + tip, gasPriceSrc = 'eth_feeHistory base + p50 tip';
  if (net.id === 'arbitrum' || gasPrice === 0) { gasPrice = hexNum(await rpc(src + '-gasprice', net.rpc, 'eth_gasPrice')); gasPriceSrc = 'eth_gasPrice'; }
  let gas, gasSrc = 'eth_estimateGas', flags = [];
  try {
    const data = '0xa9059cbb' + '0'.repeat(24) + TO[net.id] + (100n * 10n ** (net.id === 'bsc' ? 18n : 6n)).toString(16).padStart(64, '0');
    gas = hexNum(await rpc(src + '-estimategas', net.rpc, 'eth_estimateGas', [{ from: FROM[net.id], to: net.usdt_contract, data }]));
    if (gas > net.gas_fallback * 2 || gas < 20000) { flags.push('gas_estimate_out_of_range'); gas = net.gas_fallback; gasSrc = 'config fallback'; }
  } catch (e) { gas = net.gas_fallback; gasSrc = 'config fallback (' + e.message.slice(0, 60) + ')'; flags.push('gas_fallback_used'); }
  // a recipient who has never held USDT pays for a new storage slot (~63k gas on Ethereum): estimate to an empty address
  let gasNew = null; try { const d2 = '0xa9059cbb' + '0'.repeat(24) + '00000000000000000000000000000000000f3e4d' + (100n * 10n ** (net.id === 'bsc' ? 18n : 6n)).toString(16).padStart(64, '0'); gasNew = hexNum(await rpc(src + '-estimategas-new', net.rpc, 'eth_estimateGas', [{ from: FROM[net.id], to: net.usdt_contract, data: d2 }])); } catch { /* optional */ }
  const fee = (gasPrice * gas) / 1e18, fast = ((base + tip90) * gas) / 1e18;
  return {
    fee_native: fee, flags,
    cases: { existing_recipient: fee, new_recipient: gasNew ? (gasPrice * gasNew) / 1e18 : null, fast_90th_pct_tip: fast },
    breakdown: { base_fee_gwei: base / 1e9, priority_tip_gwei: tip / 1e9, tip_90th_pct_gwei: tip90 / 1e9, gas_new_recipient: gasNew, gas_price_gwei: gasPrice / 1e9, gas_price_source: gasPriceSrc, gas, gas_source: gasSrc, note: net.id === 'arbitrum' ? 'estimateGas on Arbitrum includes the L1 data cost.' : '' },
    eta_min: Math.max(1, Math.round((net.block_time_s * net.confirmations.count) / 60)),
    source: `${net.rpc} (eth_feeHistory, eth_estimateGas)`, raw: [rawRef(src + '-feehistory'), rawRef(src + '-estimategas')],
  };
}
