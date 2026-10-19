// Bitcoin: mempool.space recommended fee rates x a typical 1-input 2-output SegWit transaction (140 vB). Default = fastest.
import { getJson, rawRef } from '../lib/http.mjs';
export async function bitcoin(net) {
  const r = await getJson('btc-fees', 'https://mempool.space/api/v1/fees/recommended');
  const tier = (satvb) => (satvb * net.tx_vbytes) / 1e8;
  return {
    fee_native: tier(r.fastestFee),
    cases: { fastest_btc: tier(r.fastestFee), half_hour_btc: tier(r.halfHourFee), hour_btc: tier(r.hourFee), economy_btc: tier(r.economyFee) },
    breakdown: { sat_per_vbyte: { fastest: r.fastestFee, half_hour: r.halfHourFee, hour: r.hourFee, economy: r.economyFee, minimum: r.minimumFee }, tx_vbytes: net.tx_vbytes, note: 'Fee rates for the next block, ~30 min and ~60 min. Exchanges credit after 1-2 confirmations (10-20 min more).' },
    eta_min: 10 + Math.round((net.block_time_s * (net.confirmations.count - 1)) / 60),
    source: 'https://mempool.space/api/v1/fees/recommended', raw: [rawRef('btc-fees')],
  };
}
