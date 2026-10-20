// Binance: withdrawal fees per coin and network.
// Primary: the public endpoint behind binance.com's own fee page (no key, reachable from GitHub's US runners, same fields and
// values as the signed API: checked 2026-10-20). Fallback: GET /sapi/v1/capital/config/getall signed with a READ-ONLY key,
// which api.binance.com refuses from US addresses (HTTP 451), so it only helps when the job runs elsewhere (e.g. your Mac).
import { getJson, rawRef } from '../../lib/http.mjs';
import { networkId } from '../../lib/normalise.mjs';
import { hmacHex, env, NoKey } from '../../lib/sign.mjs';
const PUBLIC = 'https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll';
const SIGNED = 'https://api.binance.com/sapi/v1/capital/config/getall';
export async function binance(assets) {
  let coins, source, raw;
  try {
    const j = await getJson('binance-public-fees', PUBLIC, { headers: { 'User-Agent': 'Mozilla/5.0 (crypto.gulfarcade.com fee index)' } });
    if (j.code !== '000000' || !Array.isArray(j.data)) throw new Error(`binance public ${j.code}: ${j.message}`);
    coins = j.data; source = PUBLIC; raw = rawRef('binance-public-fees');
  } catch (e) {
    const key = env('BINANCE_API_KEY'), secret = env('BINANCE_API_SECRET');
    if (!key || !secret) throw e;
    const q = `timestamp=${Date.now()}&recvWindow=10000`;
    coins = await getJson('binance-capital-config', `${SIGNED}?${q}&signature=${hmacHex(secret, q)}`, { headers: { 'X-MBX-APIKEY': key } });
    source = SIGNED; raw = rawRef('binance-capital-config');
  }
  const rows = [];
  for (const coin of coins) {
    if (!assets.includes(coin.coin)) continue;
    for (const n of coin.networkList || []) {
      const id = networkId('binance', n.network); if (!id || id === 'ignore') continue;
      rows.push({ exchange: 'binance', asset: coin.coin, network: id, network_raw: n.network, fee: +n.withdrawFee, fee_asset: coin.coin, min: +n.withdrawMin, withdraw_enabled: !!n.withdrawEnable, deposit_enabled: !!n.depositEnable, deposit_confirms: n.minConfirm ?? null, unlock_confirms: n.unLockConfirm ?? null, source, raw });
    }
  }
  return rows;
}
