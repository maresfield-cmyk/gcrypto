// Solana USDT (SPL): base fee 5,000 lamports per signature + a priority tip at the 75th percentile of recent fees on the USDT
// mint (the median is usually 0), over ~200k compute units; plus the rent for a new token account, shown separately.
import { rpc, rawRef } from '../lib/http.mjs';
export async function solana(net) {
  const fees = (await rpc('solana-priorityfees', net.rpc, 'getRecentPrioritizationFees', [[net.usdt_mint]])).map((x) => x.prioritizationFee).sort((a, b) => a - b);
  const q = (p) => fees.length ? fees[Math.min(fees.length - 1, Math.floor(fees.length * p))] : 0;
  const rent = await rpc('solana-rent', net.rpc, 'getMinimumBalanceForRentExemption', [165]);
  const tipLamports = (q(0.75) * net.compute_units) / 1e6, baseLamports = 5000;
  return {
    fee_native: (baseLamports + tipLamports) / 1e9,
    cases: { new_recipient_rent_sol: rent / 1e9 },
    breakdown: { base_fee_lamports: baseLamports, priority_fee_microlamports_per_cu: { p50: q(0.5), p75: q(0.75), p90: q(0.9) }, compute_units: net.compute_units, tip_lamports: Math.round(tipLamports), samples: fees.length, note: 'A first transfer to a wallet that has never held USDT also pays the token-account rent (refundable only by closing the account).' },
    eta_min: 1,
    source: `${net.rpc} (getRecentPrioritizationFees, getMinimumBalanceForRentExemption)`, raw: [rawRef('solana-priorityfees'), rawRef('solana-rent')],
  };
}
