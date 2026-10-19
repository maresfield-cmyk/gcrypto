// Binance: GET /sapi/v1/capital/config/getall, signed (HMAC-SHA256 of the query string) with a READ-ONLY key.
// NOTE: api.binance.com refuses US IP addresses (HTTP 451); see docs/runbook.md if the scheduler runs in the US.
import { getJson, rawRef } from '../../lib/http.mjs';
import { networkId } from '../../lib/normalise.mjs';
import { hmacHex, env, NoKey } from '../../lib/sign.mjs';
export async function binance(assets) {
  const key = env('BINANCE_API_KEY'), secret = env('BINANCE_API_SECRET');
  if (!key || !secret) throw new NoKey('binance');
  const q = `timestamp=${Date.now()}&recvWindow=10000`;
  const j = await getJson('binance-capital-config', `https://api.binance.com/sapi/v1/capital/config/getall?${q}&signature=${hmacHex(secret, q)}`, { headers: { 'X-MBX-APIKEY': key } });
  const rows = [];
  for (const coin of j) {
    if (!assets.includes(coin.coin)) continue;
    for (const n of coin.networkList || []) {
      const id = networkId('binance', n.network); if (!id || id === 'ignore') continue;
      rows.push({ exchange: 'binance', asset: coin.coin, network: id, network_raw: n.network, fee: +n.withdrawFee, fee_asset: coin.coin, min: +n.withdrawMin, withdraw_enabled: !!n.withdrawEnable, deposit_enabled: !!n.depositEnable, deposit_confirms: n.minConfirm ?? null, unlock_confirms: n.unLockConfirm ?? null, source: 'https://api.binance.com/sapi/v1/capital/config/getall', raw: rawRef('binance-capital-config') });
    }
  }
  return rows;
}
