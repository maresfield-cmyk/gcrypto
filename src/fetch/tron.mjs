// Tron. Token (USDT, USDC): energy price from chain parameters, energy for a 100-unit transfer measured with
// triggerconstantcontract (includes the dynamic energy penalty), for an existing holder and a never-funded address; default =
// burning TRX for energy, bandwidth covered by the free daily quota. Native TRX: bandwidth only (~268 bytes), shown as the
// burn cost when the free quota (600 bandwidth/day) is used up; most single daily transfers are free.
import { getJson, rawRef, sleep } from '../lib/http.mjs';
const b58 = (s) => { const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = 0n; for (const c of s) n = n * 58n + BigInt(A.indexOf(c)); let h = n.toString(16); if (h.length % 2) h = '0' + h; return h; };
const param = (to, decimals) => '0'.repeat(24) + b58(to).slice(2, 42) + '0'.repeat(48) + (100n * 10n ** BigInt(decimals)).toString(16).padStart(16, '0');
// The estimation wallet is the sender of the token's latest real transfer: it holds the token right now, and energy use does
// not depend on who sends. Nothing is ever sent; the call is a read-only simulation.
async function latestHolder(contract, decimals, H) {
  const ev = await getJson(`tron-${contract.slice(0, 6)}-events`, `https://api.trongrid.io/v1/contracts/${contract}/events?event_name=Transfer&limit=10&only_confirmed=true`, { headers: H });
  const seen = new Set();
  for (const e of ev.data || []) {
    let f = e.result && (e.result.from || e.result[0]); if (!f) continue;
    f = f.startsWith('T') ? f : (f = f.replace(/^0x/, ''), hexToB58(f.length === 40 ? '41' + f : f));
    if (seen.has(f)) continue; seen.add(f);
    await sleep(500);   // read-only balanceOf: does this sender still hold at least 100 tokens?
    const bal = await getJson(`tron-${contract.slice(0, 6)}-balance`, 'https://api.trongrid.io/wallet/triggerconstantcontract', { method: 'POST', headers: H, body: { owner_address: f, contract_address: contract, function_selector: 'balanceOf(address)', parameter: '0'.repeat(24) + b58(f).slice(2, 42), visible: true } });
    const v = bal.constant_result && bal.constant_result[0] ? BigInt('0x' + bal.constant_result[0]) : 0n;
    if (v >= 100n * 10n ** BigInt(decimals)) return f;
  }
  throw new Error('tron: no recent sender with a balance to estimate from');
}
function hexToB58(hex) { const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; const { createHash } = cryptoMod; const payload = Buffer.from(hex, 'hex'); const chk = createHash('sha256').update(createHash('sha256').update(payload).digest()).digest().subarray(0, 4); let n = BigInt('0x' + Buffer.concat([payload, chk]).toString('hex')), out = ''; while (n > 0n) { out = A[Number(n % 58n)] + out; n /= 58n; } return out; }
import * as cryptoMod from 'node:crypto';
const TO_EXISTING = 'TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX', TO_NEW = 'TXmVpin5vq5gdZsciyyjdZgKRUju4st1wM';
let cachedParams = null;
export async function tron(net, asset, on) {
  const H = process.env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } : {};
  if (!cachedParams) cachedParams = (await getJson('tron-chainparameters', 'https://api.trongrid.io/wallet/getchainparameters', { headers: H })).chainParameter;
  const p = (k) => cachedParams.find((x) => x.key === k).value;
  const energySun = p('getEnergyFee'), bandwidthSun = p('getTransactionFee');
  const eta = Math.max(1, Math.round((net.block_time_s * net.confirmations.count) / 60));
  if (on.native) {
    const BYTES = 268, fee = (BYTES * bandwidthSun) / 1e6;
    return { fee_native: fee, cases: { with_free_daily_bandwidth: 0 }, breakdown: { bandwidth_price_sun_per_byte: bandwidthSun, tx_bytes: BYTES, note: 'A plain TRX transfer uses bandwidth only. Every account gets 600 free bandwidth a day, so one or two transfers a day cost nothing; this is the cost once the quota is used.' }, eta_min: eta, source: 'https://api.trongrid.io (getchainparameters)', raw: [rawRef('tron-chainparameters')] };
  }
  const FROM = await latestHolder(on.contract, on.decimals, H); await sleep(600);
  const est = async (src, to) => { const j = await getJson(src, 'https://api.trongrid.io/wallet/triggerconstantcontract', { method: 'POST', headers: H, body: { owner_address: FROM, contract_address: on.contract, function_selector: 'transfer(address,uint256)', parameter: param(to, on.decimals), visible: true } });
    const reverted = (j.result && /REVERT/i.test(j.result.message || '')) || (j.constant_result && j.constant_result[0] && j.constant_result[0].startsWith('08c379a0'));
    if (!(j.result && j.result.result) || !j.energy_used || reverted) throw new Error(`tron ${asset.symbol} estimate ${reverted ? 'reverted: ' + revertReason(j) + ' (holder ' + FROM + ')' : 'failed'}`); return j; };
  function revertReason(j) { try { const h = j.constant_result[0].slice(8 + 64 * 2); return Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/, '').trim() || 'no reason'; } catch { return 'no reason'; } }
  const ex = await est(`tron-${asset.id}-energy-existing`, TO_EXISTING); await sleep(600);
  const nw = await est(`tron-${asset.id}-energy-new`, TO_NEW); await sleep(600);
  const BYTES = 345, trx = (energy) => (energy * energySun) / 1e6;
  return {
    fee_native: trx(ex.energy_used),
    cases: { existing_recipient: trx(ex.energy_used), new_recipient: trx(nw.energy_used), bandwidth_if_no_free_quota_trx: (BYTES * bandwidthSun) / 1e6 },
    breakdown: { estimation_wallet: FROM, energy_price_sun: energySun, energy_existing: ex.energy_used, energy_penalty: ex.energy_penalty, energy_new_recipient: nw.energy_used, bandwidth_price_sun_per_byte: bandwidthSun, tx_bytes: BYTES, note: 'Energy burned as TRX. Staking TRX for energy makes the transfer nearly free; most users do not.' },
    eta_min: eta, source: 'https://api.trongrid.io (getchainparameters, triggerconstantcontract)', raw: [rawRef('tron-chainparameters'), rawRef(`tron-${asset.id}-energy-existing`), rawRef(`tron-${asset.id}-energy-new`)],
  };
}
