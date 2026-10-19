// Solana. Token (USDT, USDC): base fee 5,000 lamports + a priority tip at the 75th percentile of recent fees on that mint
// (the median is usually 0), over ~200k compute units; plus the rent for a new token account, shown separately.
// Native SOL: base fee + the same tip over ~450 compute units (a plain transfer is tiny).
import { rpc, rawRef } from '../lib/http.mjs';
let rentCache = null;
export async function solana(net, asset, on) {
  const key = on.native ? 'solana-priorityfees-native' : `solana-priorityfees-${asset.id}`;
  const fees = (await rpc(key, net.rpc, 'getRecentPrioritizationFees', on.native ? [] : [[on.mint]])).map((x) => x.prioritizationFee).sort((a, b) => a - b);
  const q = (p) => fees.length ? fees[Math.min(fees.length - 1, Math.floor(fees.length * p))] : 0;
  const cu = on.native ? 450 : net.compute_units, tipLamports = (q(0.75) * cu) / 1e6, baseLamports = 5000;
  const out = { fee_native: (baseLamports + tipLamports) / 1e9, breakdown: { base_fee_lamports: baseLamports, priority_fee_microlamports_per_cu: { p50: q(0.5), p75: q(0.75), p90: q(0.9) }, compute_units: cu, tip_lamports: Math.round(tipLamports), samples: fees.length, note: '' }, eta_min: 1, source: `${net.rpc} (getRecentPrioritizationFees)`, raw: [rawRef(key)] };
  if (!on.native) {
    if (rentCache == null) rentCache = await rpc('solana-rent', net.rpc, 'getMinimumBalanceForRentExemption', [165]);
    out.cases = { new_recipient_rent_sol: rentCache / 1e9 }; out.breakdown.note = 'A first transfer to a wallet that has never held this token also pays the token-account rent (refundable only by closing the account).'; out.raw.push(rawRef('solana-rent'));
  }
  return out;
}
