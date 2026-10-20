// Bybit: GET /v5/asset/coin/query-info, signed headers (HMAC-SHA256 of timestamp + key + recvWindow + query) with a READ-ONLY key.
// Keys only work on the host of the entity the account belongs to: our account is Bybit EU (api.bybit.eu); global accounts use api.bybit.com. Set BYBIT_API_HOST to switch.
import { getJson, rawRef } from '../../lib/http.mjs';
import { networkId } from '../../lib/normalise.mjs';
import { hmacHex, env, NoKey } from '../../lib/sign.mjs';
export async function bybit(assets) {
  const key = env('BYBIT_API_KEY'), secret = env('BYBIT_API_SECRET'), host = env('BYBIT_API_HOST') || 'api.bybit.eu';
  if (!key || !secret) throw new NoKey('bybit');
  const rows = [];
  for (const a of assets) {
    const q = `coin=${a}`, ts = String(Date.now()), rw = '10000';
    const j = await getJson(`bybit-${a}`, `https://${host}/v5/asset/coin/query-info?${q}`, { headers: { 'X-BAPI-API-KEY': key, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': rw, 'X-BAPI-SIGN': hmacHex(secret, ts + key + rw + q) } });
    if (j.retCode !== 0) throw new Error(`bybit ${j.retCode}: ${j.retMsg}`);
    for (const coin of j.result.rows || []) for (const c of coin.chains || []) {
      const id = networkId('bybit', c.chain); if (!id || id === 'ignore') continue;
      rows.push({ exchange: 'bybit', asset: a, network: id, network_raw: c.chain, fee: +c.withdrawFee, fee_asset: a, min: +c.withdrawMin, withdraw_enabled: c.chainWithdraw === '1', deposit_enabled: c.chainDeposit === '1', deposit_confirms: c.confirmation ? +c.confirmation : null, source: `https://${host}/v5/asset/coin/query-info`, raw: rawRef(`bybit-${a}`) });
    }
  }
  return rows;
}
