// KuCoin: public, no key. One call per asset.
import { getJson, rawRef } from '../../lib/http.mjs';
import { networkId } from '../../lib/normalise.mjs';
export async function kucoin(assets) {
  const rows = [];
  for (const a of assets) {
    const j = await getJson(`kucoin-${a}`, `https://api.kucoin.com/api/v3/currencies/${a}`);
    for (const c of j.data.chains || []) {
      const id = networkId('kucoin', c.chainName); if (!id || id === 'ignore') continue;
      rows.push({ exchange: 'kucoin', asset: a, network: id, network_raw: c.chainName, fee: +c.withdrawalMinFee, fee_asset: a, min: +c.withdrawalMinSize, withdraw_enabled: !!c.isWithdrawEnabled, deposit_enabled: !!c.isDepositEnabled, deposit_confirms: c.confirms ?? null, source: `https://api.kucoin.com/api/v3/currencies/${a}`, raw: rawRef(`kucoin-${a}`) });
    }
  }
  return rows;
}
