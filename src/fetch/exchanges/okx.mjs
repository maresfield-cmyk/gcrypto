// OKX: GET /api/v5/asset/currencies, signed headers (base64 HMAC-SHA256 of timestamp + method + path) with a READ-ONLY key + passphrase.
import { getJson, rawRef } from '../../lib/http.mjs';
import { networkId } from '../../lib/normalise.mjs';
import { hmacB64, env, NoKey } from '../../lib/sign.mjs';
export async function okx(assets) {
  const key = env('OKX_API_KEY'), secret = env('OKX_API_SECRET'), pass = env('OKX_PASSPHRASE');
  if (!key || !secret || !pass) throw new NoKey('okx');
  const path = `/api/v5/asset/currencies?ccy=${assets.join(',')}`, ts = new Date().toISOString();
  const j = await getJson('okx-currencies', `https://www.okx.com${path}`, { headers: { 'OK-ACCESS-KEY': key, 'OK-ACCESS-SIGN': hmacB64(secret, ts + 'GET' + path), 'OK-ACCESS-TIMESTAMP': ts, 'OK-ACCESS-PASSPHRASE': pass } });
  if (j.code !== '0') throw new Error(`okx ${j.code}: ${j.msg}`);
  const rows = [];
  for (const c of j.data || []) {
    const raw = c.chain.startsWith(c.ccy + '-') ? c.chain.slice(c.ccy.length + 1) : c.chain;   // "USDT-TRC20" -> "TRC20"
    const id = networkId('okx', raw); if (!id || id === 'ignore') continue;
    rows.push({ exchange: 'okx', asset: c.ccy, network: id, network_raw: c.chain, fee: +c.minFee, fee_asset: c.ccy, min: +c.minWd, withdraw_enabled: !!c.canWd, deposit_enabled: !!c.canDep, deposit_confirms: c.minDepArrivalConfirm ? +c.minDepArrivalConfirm : null, source: 'https://www.okx.com/api/v5/asset/currencies', raw: rawRef('okx-currencies') });
  }
  return rows;
}
