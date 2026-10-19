// Bitget: public, no key. One call per asset.
import { getJson, rawRef } from '../../lib/http.mjs';
import { networkId } from '../../lib/normalise.mjs';
export async function bitget(assets) {
  const rows = [];
  for (const a of assets) {
    const j = await getJson(`bitget-${a}`, `https://api.bitget.com/api/v2/spot/public/coins?coin=${a}`);
    for (const c of (j.data && j.data[0] && j.data[0].chains) || []) {
      const id = networkId('bitget', c.chain); if (!id || id === 'ignore') continue;
      rows.push({ exchange: 'bitget', asset: a, network: id, network_raw: c.chain, fee: +c.withdrawFee, fee_asset: a, min: +c.minWithdrawAmount, withdraw_enabled: c.withdrawable === 'true', deposit_enabled: c.rechargeable === 'true', deposit_confirms: c.depositConfirm ? +c.depositConfirm : null, source: `https://api.bitget.com/api/v2/spot/public/coins?coin=${a}`, raw: rawRef(`bitget-${a}`) });
    }
  }
  return rows;
}
