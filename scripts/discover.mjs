// Phase 1 discovery: call every data source in docs/SPEC.md, keep a sample response, note key needs and rate limits.
// Run:  node scripts/discover.mjs      -> docs/discovery-report.md + data/raw/discovery/*.json
import fs from 'node:fs';
const OUT = 'data/raw/discovery'; fs.mkdirSync(OUT, { recursive: true });
const results = [];
const limit = (s, n = 700) => (s.length > n ? s.slice(0, n) + ' …' : s);
async function probe(id, { url, method = 'GET', body, headers = {}, note = '', keyNeeded = 'no', extract }) {
  const t0 = Date.now();
  const r = { id, url, keyNeeded, note, ok: false, status: null, ms: 0, sample: '', extracted: null, rate: {} };
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'user-agent': 'gulf-crypto-fee-index-discovery/0.1', ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, signal: ctl.signal });
    clearTimeout(tm);
    r.status = res.status; r.ms = Date.now() - t0;
    for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'ratelimit-limit', 'ratelimit-remaining', 'x-mbx-used-weight-1m', 'retry-after', 'cf-ray', 'content-type'])
      if (res.headers.get(h)) r.rate[h] = res.headers.get(h);
    const text = await res.text();
    fs.writeFileSync(`${OUT}/${id}.txt`, text);
    r.sample = limit(text.replace(/\s+/g, ' '));
    let json = null; try { json = JSON.parse(text); } catch {}
    if (extract) { try { r.extracted = extract(json, text); } catch (e) { r.extracted = 'extract failed: ' + e.message; } }
    r.ok = res.ok && (extract ? r.extracted != null && !String(r.extracted).startsWith('extract failed') : true);
  } catch (e) { r.ms = Date.now() - t0; r.sample = 'ERROR ' + e.message; }
  results.push(r); console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${id.padEnd(28)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)}ms  ${r.extracted != null ? JSON.stringify(r.extracted).slice(0, 110) : r.sample.slice(0, 90)}`);
}
const rpc = (method, params = []) => ({ method: 'POST', body: { jsonrpc: '2.0', id: 1, method, params } });
const hexToNum = (h) => Number(BigInt(h));
const USDT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
// Binance's hot wallet (holds USDT); a known funded user address; a fresh address that has never held USDT (energy differs)
const TRON_FROM = 'TV6MuMXfmLbBqPZvBHdwFsDnQeVfnmiuSi', TRON_TO_EXISTING = 'TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX', TRON_TO_NEW = 'TXmVpin5vq5gdZsciyyjdZgKRUju4st1wM';
const tronAddrHex = (b58) => null; // not needed: TronGrid accepts base58 with visible=true

// ---------- Layer 1: networks ----------
await probe('tron.chainparameters', { url: 'https://api.trongrid.io/wallet/getchainparameters', note: 'energy price (sun) + bandwidth price; free, optional TRON-PRO-API-KEY raises limits',
  extract: (j) => Object.fromEntries(j.chainParameter.filter((p) => ['getEnergyFee', 'getTransactionFee', 'getCreateNewAccountFeeInSystemContract', 'getCreateAccountFee'].includes(p.key)).map((p) => [p.key, p.value])) });
await probe('tron.energy.existing', { url: 'https://api.trongrid.io/wallet/triggerconstantcontract', ...rpc(), body: { owner_address: TRON_FROM, contract_address: USDT_TRON, function_selector: 'transfer(address,uint256)', parameter: '000000000000000000000000' + '0'.repeat(0) + 'PLACEHOLDER', visible: true }, note: 'placeholder, replaced below' });
results.pop(); // replaced by the proper calls below (need hex params)
import { createHash } from 'node:crypto';
function b58decode(s) { const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = 0n; for (const c of s) n = n * 58n + BigInt(A.indexOf(c)); let h = n.toString(16); if (h.length % 2) h = '0' + h; return h; }
const tronParam = (b58) => '0'.repeat(24) + b58decode(b58).slice(2, 42) + '0'.repeat(64 - 16) + (100n * 10n ** 6n).toString(16).padStart(16, '0');
for (const [id, to] of [['tron.energy.existing', TRON_TO_EXISTING], ['tron.energy.new', TRON_TO_NEW]])
  await probe(id, { url: 'https://api.trongrid.io/wallet/triggerconstantcontract', method: 'POST', body: { owner_address: TRON_FROM, contract_address: USDT_TRON, function_selector: 'transfer(address,uint256)', parameter: tronParam(to), visible: true }, note: 'energy a 100 USDT transfer would use (existing vs never-funded recipient)', extract: (j) => ({ energy_used: j.energy_used, energy_penalty: j.energy_penalty, result: j.result && j.result.result }) });
await probe('tron.tronscan.chainparams', { url: 'https://apilist.tronscanapi.com/api/chainparameters', note: 'alternative source for the same parameters', extract: (j) => (j.tronParameters || j).length ?? Object.keys(j).length });
await probe('eth.gasPrice', { url: 'https://ethereum-rpc.publicnode.com', ...rpc('eth_gasPrice'), note: 'public RPC, no key', extract: (j) => ({ gwei: hexToNum(j.result) / 1e9 }) });
await probe('eth.feeHistory', { url: 'https://ethereum-rpc.publicnode.com', ...rpc('eth_feeHistory', ['0x5', 'latest', [25, 50, 75]]), extract: (j) => ({ baseFeeGwei: hexToNum(j.result.baseFeePerGas.at(-1)) / 1e9, p50PriorityGwei: hexToNum(j.result.reward.at(-1)[1]) / 1e9 }) });
await probe('eth.usdtTransferGas', { url: 'https://ethereum-rpc.publicnode.com', ...rpc('eth_estimateGas', [{ from: '0xF977814e90dA44bFA03b6295A0616a897441aceC', to: '0xdAC17F958D2ee523a2206206994597C13D831ec7', data: '0xa9059cbb000000000000000000000000' + '28c6c06298d514db089934071355e5743bf21d60' + (100n * 10n ** 6n).toString(16).padStart(64, '0') }]), note: 'estimateGas for a 100 USDT ERC-20 transfer from Binance hot wallet to a funded address', extract: (j) => ({ gas: hexToNum(j.result) }) });
await probe('sol.priorityFees', { url: 'https://api.mainnet-beta.solana.com', ...rpc('getRecentPrioritizationFees', [['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']]), note: 'public RPC; USDT mint; base fee is 5000 lamports/signature', extract: (j) => { const f = j.result.map((x) => x.prioritizationFee).sort((a, b) => a - b); return { samples: f.length, p50_microLamportsPerCU: f[Math.floor(f.length / 2)], max: f.at(-1) }; } });
await probe('sol.rentTokenAccount', { url: 'https://api.mainnet-beta.solana.com', ...rpc('getMinimumBalanceForRentExemption', [165]), note: 'rent for a new token account (165 bytes)', extract: (j) => ({ lamports: j.result, sol: j.result / 1e9 }) });
await probe('bsc.gasPrice', { url: 'https://bsc-rpc.publicnode.com', ...rpc('eth_gasPrice'), extract: (j) => ({ gwei: hexToNum(j.result) / 1e9 }) });
await probe('polygon.gasPrice', { url: 'https://polygon-bor-rpc.publicnode.com', ...rpc('eth_gasPrice'), extract: (j) => ({ gwei: hexToNum(j.result) / 1e9 }) });
await probe('polygon.feeHistory', { url: 'https://polygon-bor-rpc.publicnode.com', ...rpc('eth_feeHistory', ['0x5', 'latest', [50]]), extract: (j) => ({ baseFeeGwei: hexToNum(j.result.baseFeePerGas.at(-1)) / 1e9, p50PriorityGwei: hexToNum(j.result.reward.at(-1)[0]) / 1e9 }) });
await probe('arb.gasPrice', { url: 'https://arb1.arbitrum.io/rpc', ...rpc('eth_gasPrice'), note: 'Arbitrum official public RPC', extract: (j) => ({ gwei: hexToNum(j.result) / 1e9 }) });
await probe('arb.usdtTransferGas', { url: 'https://arb1.arbitrum.io/rpc', ...rpc('eth_estimateGas', [{ from: '0xF977814e90dA44bFA03b6295A0616a897441aceC', to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', data: '0xa9059cbb000000000000000000000000' + 'b38e8c17e38363af6ebdcb3dae12e0243582891d' + (100n * 10n ** 6n).toString(16).padStart(64, '0') }]), note: 'estimateGas on Arbitrum already includes the L1 data component', extract: (j) => ({ gas: hexToNum(j.result) }) });
await probe('ton.config', { url: 'https://tonapi.io/v2/blockchain/config', note: 'tonapi public (rate limited without key, ~1 rps)', extract: (j) => ({ keys: Object.keys(j).slice(0, 8) }) });
await probe('ton.toncenter.config', { url: 'https://toncenter.com/api/v2/getConfigParam?config_id=25', note: 'toncenter public: gas/fwd price config (key optional, 1 rps without)', extract: (j) => ({ ok: j.ok, type: j.result && j.result.config && j.result.config['@type'] }) });
await probe('ton.usdtJettonTx', { url: 'https://tonapi.io/v2/blockchain/accounts/EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs/transactions?limit=3', note: 'recent USDT jetton master txs: see real total_fees for a jetton transfer', extract: (j) => ({ txs: j.transactions.length, total_fees_nanoton: j.transactions.map((t) => t.total_fees) }) });
await probe('btc.fees', { url: 'https://mempool.space/api/v1/fees/recommended', note: 'mempool.space free, no key', extract: (j) => j });
await probe('btc.mempoolBlocks', { url: 'https://mempool.space/api/v1/fees/mempool-blocks', extract: (j) => ({ blocks: j.length, nextMedianFee: j[0] && j[0].medianFee }) });
await probe('price.coingecko', { url: 'https://api.coingecko.com/api/v3/simple/price?ids=tron,ethereum,solana,binancecoin,polygon-ecosystem-token,the-open-network,bitcoin,tether&vs_currencies=usd&include_last_updated_at=true', note: 'free tier: ~30 calls/min, no key (demo key optional)', extract: (j) => Object.fromEntries(Object.entries(j).map(([k, v]) => [k, v.usd])) });
await probe('price.binanceTicker', { url: 'https://api.binance.com/api/v3/ticker/price?symbols=["TRXUSDT","ETHUSDT","SOLUSDT","BNBUSDT","POLUSDT","TONUSDT","BTCUSDT"]', note: 'exchange public ticker, no key: fallback price source', extract: (j) => Object.fromEntries(j.map((x) => [x.symbol, +x.price])) });
await probe('price.okxTicker', { url: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT', note: 'second fallback', extract: (j) => ({ count: j.data.length, trx: j.data.find((x) => x.instId === 'TRX-USDT')?.last }) });
// ---------- Layer 2: exchanges ----------
await probe('binance.withdrawFees', { url: 'https://api.binance.com/sapi/v1/capital/config/getall', keyNeeded: 'yes (read-only key, signed request)', note: 'expect 401 without key: proves the endpoint exists', extract: (j) => ({ code: j.code, msg: j.msg }) });
await probe('bybit.coinInfo', { url: 'https://api.bybit.com/v5/asset/coin/query-info?coin=USDT', keyNeeded: 'yes (read-only key)', note: 'expect retCode 10003/10004 without key', extract: (j) => ({ retCode: j.retCode, retMsg: j.retMsg }) });
await probe('okx.currencies', { url: 'https://www.okx.com/api/v5/asset/currencies?ccy=USDT', keyNeeded: 'yes (read-only key + passphrase)', note: 'expect code 50103/50111 without key', extract: (j) => ({ code: j.code, msg: j.msg }) });
await probe('kucoin.currencies', { url: 'https://api.kucoin.com/api/v3/currencies/USDT', note: 'public', extract: (j) => ({ chains: j.data.chains.map((c) => `${c.chainName}:${c.withdrawalMinFee}/min ${c.withdrawalMinSize}`) }) });
await probe('bitget.coins', { url: 'https://api.bitget.com/api/v2/spot/public/coins?coin=USDT', note: 'public', extract: (j) => ({ chains: j.data[0].chains.map((c) => `${c.chain}:${c.withdrawFee}/min ${c.minWithdrawAmount}`) }) });
await probe('cryptocom.currencyNetworks', { url: 'https://api.crypto.com/exchange/v1/public/get-currency-networks', note: 'Crypto.com Exchange: documented as needing auth in some versions; check', extract: (j) => ({ code: j.code, keys: j.result ? Object.keys(j.result).slice(0, 3) : null, msg: j.message }) });
await probe('cryptocom.feePage', { url: 'https://crypto.com/exchange/fees', note: 'fee page (manual fallback)', extract: (j, t) => ({ html: t.length, mentionsUSDT: /USDT/.test(t) }) });
await probe('rain.feePage', { url: 'https://www.rain.com/fees', note: 'Rain (Bahrain/UAE): manual sheet likely', extract: (j, t) => ({ html: t.length, mentionsUSDT: /USDT|Tether/i.test(t), mentionsFee: /withdraw/i.test(t) }) });
await probe('bitoasis.feePage', { url: 'https://bitoasis.net/en/fees', note: 'BitOasis (UAE): manual sheet likely', extract: (j, t) => ({ html: t.length, mentionsUSDT: /USDT|Tether/i.test(t), mentionsFee: /withdraw/i.test(t) }) });
await probe('coinmena.feePage', { url: 'https://www.coinmena.com/fees', note: 'CoinMENA (Bahrain): manual sheet likely', extract: (j, t) => ({ html: t.length, mentionsUSDT: /USDT|Tether/i.test(t), mentionsFee: /withdraw/i.test(t) }) });

fs.writeFileSync(`${OUT}/_results.json`, JSON.stringify({ ran_at: new Date().toISOString(), results }, null, 1));
const md = ['# Discovery report: data sources', '', `Run: ${new Date().toISOString()} from this Mac. Raw responses in \`data/raw/discovery/\`.`, '', '| Source | Works | Status | Time | Key needed | Rate-limit headers | What came back |', '|---|---|---|---|---|---|---|'];
for (const r of results) md.push(`| ${r.id} | ${r.ok ? 'yes' : 'NO'} | ${r.status ?? 'error'} | ${r.ms} ms | ${r.keyNeeded} | ${Object.entries(r.rate).filter(([k]) => !/cf-ray|content-type/.test(k)).map(([k, v]) => `${k}=${v}`).join(' ') || '–'} | ${(r.extracted != null ? JSON.stringify(r.extracted) : r.sample).replace(/\|/g, '\\|').slice(0, 160)} |`);
md.push('', '## Notes', ...results.filter((r) => r.note).map((r) => `- **${r.id}:** ${r.note}`));
fs.writeFileSync('docs/discovery-report.md', md.join('\n') + '\n');
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} sources answered as expected. Report: docs/discovery-report.md`);
