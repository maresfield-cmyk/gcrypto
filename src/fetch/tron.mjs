// Tron USDT (TRC-20): energy price and bandwidth price from chain parameters; energy for a 100 USDT transfer measured with
// triggerconstantcontract (it includes the dynamic energy penalty on the USDT contract), for an existing holder and for a
// never-funded address. Default shown = burning TRX for energy (no staking), bandwidth assumed covered by the free daily quota.
import { getJson, rawRef, sleep } from '../lib/http.mjs';
const b58 = (s) => { const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = 0n; for (const c of s) n = n * 58n + BigInt(A.indexOf(c)); let h = n.toString(16); if (h.length % 2) h = '0' + h; return h; };
const param = (to) => '0'.repeat(24) + b58(to).slice(2, 42) + '0'.repeat(48) + (100n * 10n ** 6n).toString(16).padStart(16, '0');
const FROM = 'TV6MuMXfmLbBqPZvBHdwFsDnQeVfnmiuSi';          // a wallet that holds USDT (Binance hot wallet): estimation only, nothing is sent
const TO_EXISTING = 'TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX';   // an address that already holds USDT
const TO_NEW = 'TXmVpin5vq5gdZsciyyjdZgKRUju4st1wM';        // an address that has never held USDT
export async function tron(net) {
  const H = process.env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } : {};
  const cp = (await getJson('tron-chainparameters', 'https://api.trongrid.io/wallet/getchainparameters', { headers: H })).chainParameter;
  const p = (k) => cp.find((x) => x.key === k).value;
  const energySun = p('getEnergyFee'), bandwidthSun = p('getTransactionFee');
  const est = async (src, to) => { const j = await getJson(src, 'https://api.trongrid.io/wallet/triggerconstantcontract', { method: 'POST', headers: H, body: { owner_address: FROM, contract_address: net.usdt_contract, function_selector: 'transfer(address,uint256)', parameter: param(to), visible: true } }); if (!(j.result && j.result.result) || !j.energy_used) throw new Error('tron estimate failed'); return j; };
  const ex = await est('tron-energy-existing', TO_EXISTING); await sleep(600);
  const nw = await est('tron-energy-new', TO_NEW);
  const BYTES = 345;                                      // typical TRC-20 transfer size; free quota is 600 bandwidth/day
  const trx = (energy) => (energy * energySun) / 1e6;
  return {
    fee_native: trx(ex.energy_used),                      // default case: existing recipient, TRX burned for energy
    cases: {
      existing_recipient: { energy: ex.energy_used, energy_penalty: ex.energy_penalty, fee_trx: trx(ex.energy_used) },
      new_recipient: { energy: nw.energy_used, energy_penalty: nw.energy_penalty, fee_trx: trx(nw.energy_used) },
      bandwidth_if_no_free_quota_trx: (BYTES * bandwidthSun) / 1e6,
    },
    breakdown: { energy_price_sun: energySun, bandwidth_price_sun_per_byte: bandwidthSun, tx_bytes: BYTES, note: 'Energy burned as TRX. Staking TRX for energy makes the transfer nearly free; most users do not.' },
    eta_min: Math.max(1, Math.round((net.block_time_s * net.confirmations.count) / 60)),
    source: 'https://api.trongrid.io (getchainparameters, triggerconstantcontract)', raw: [rawRef('tron-chainparameters'), rawRef('tron-energy-existing'), rawRef('tron-energy-new')],
  };
}
