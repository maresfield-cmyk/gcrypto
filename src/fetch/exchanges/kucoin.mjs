// KuCoin: public, no key. One call per asset.
import { getJson, rawRef } from '../../lib/http.mjs';
import { networkId } from '../../lib/normalise.mjs';
import { symbols } from '../../lib/symbols.mjs';
export async function kucoin(assets) {
  const rows = [];
  for (const a of assets) {
    let j = null;
    for (const sym of symbols(a)) { try { const r = await getJson(`kucoin-${sym}`, `https://api.kucoin.com/api/v3/currencies/${sym}`); if (r.data && r.data.chains) { j = r; break; } } catch (e) { if (!/does not exist|404/i.test(e.message)) throw e; } }
    if (!j) continue;                                     // the exchange does not list this coin: no rows, not a failure
    for (const c of j.data.chains || []) {
      const id = networkId('kucoin', c.chainName); if (!id || id === 'ignore') continue;
      rows.push({ exchange: 'kucoin', asset: a, network: id, network_raw: c.chainName, fee: +c.withdrawalMinFee, fee_asset: a, min: +c.withdrawalMinSize, withdraw_enabled: !!c.isWithdrawEnabled, deposit_enabled: !!c.isDepositEnabled, deposit_confirms: c.confirms ?? null, source: `https://api.kucoin.com/api/v3/currencies/${a}`, raw: rawRef(`kucoin-${a}`) });
    }
  }
  return rows;
}
