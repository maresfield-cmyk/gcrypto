# Discovery report (phase 1)

Run on 2026-10-19 from Patrick's Mac. Every call below was made for real today; raw responses are in `data/raw/discovery/`. The table at the end is the script's own log (`scripts/discover.mjs`; rerun it any time).

## Verdict per source

### Layer 1: networks (all free, all working, no keys required)

| Network | Source used | Works | Key | Rate limit seen | What we get |
|---|---|---|---|---|---|
| Tron | TronGrid `getchainparameters` + `triggerconstantcontract` | yes | optional free key | 429 after ~4 rapid calls without a key | energy price 100 sun, bandwidth 1,000 sun/byte; a 100 USDT transfer costs **64,285 energy to an existing holder** and **130,285 to a never-funded address** (both include Tron's dynamic energy penalty on the USDT contract). Burning TRX: 6.43 TRX ≈ $2.13 and 13.03 TRX ≈ $4.31 at $0.331 |
| Tron (alt) | Tronscan `chainparameters` | NO (429 every time) | – | very low without key | drop it; TronGrid is enough |
| Ethereum | publicnode RPC `eth_gasPrice`, `eth_feeHistory`, `eth_estimateGas` | yes | none | none seen | base 0.158 gwei, p50 tip 0.1 gwei; a USDT transfer = **46,479 gas** (measured by estimateGas, not the 65,000 in the spec) → ≈ $0.02 |
| Solana | mainnet RPC `getRecentPrioritizationFees` (USDT mint) + `getMinimumBalanceForRentExemption(165)` | yes | none | public RPC is throttled per IP | priority fee p50–p95 = 0 µlamports/CU right now (max 468,750): a plain transfer is the 5,000-lamport base fee ≈ $0.0005; **rent for a new token account 0.001488 SOL ≈ $0.15** |
| BNB Chain | publicnode RPC | yes | none | – | 0.05 gwei |
| Polygon PoS | publicnode RPC `eth_gasPrice` + `eth_feeHistory` | yes | none | – | base 154 gwei, p50 tip 75 gwei (POL is cheap: ≈ $0.001 per transfer) |
| Arbitrum One | official public RPC `eth_gasPrice` + `eth_estimateGas` | yes | none | – | 0.02 gwei; USDT transfer **45,214 gas**, and estimateGas on Arbitrum already includes the L1 data component |
| TON | tonapi `blockchain/config`, toncenter `getConfigParam`, tonapi recent USDT jetton txs | yes | optional free key | tonapi ≈ 1 request/s without key | config params load; recent jetton transactions show `total_fees` ≈ 0.00045 TON on the master contract, which is **not** what a sender pays. Phase 2 must price a TON USDT transfer from real sender transactions (median of recent jetton-transfer events, tonapi `accounts/{wallet}/events`) rather than from config alone |
| Bitcoin | mempool.space `fees/recommended` + `mempool-blocks` | yes | none | generous, no key | fastest 3, half-hour 3, hour 1 sat/vB; next-block median 2.0; typical 1-in/2-out segwit tx ≈ 140 vB → ≈ $0.34 |
| Prices | CoinGecko `simple/price` (8 coins in one call) | yes | none | ~30 calls/min free | all 8 prices in one call; cache 5 min |
| Prices (fallback) | Binance `ticker/price`, OKX `market/tickers` | yes | none | – | both work; cross-check source |

### Layer 2: exchanges

| Exchange | Endpoint | Works | Key | Notes |
|---|---|---|---|---|
| Binance | `GET /sapi/v1/capital/config/getall` | exists | **read-only key, signed** | answered `-2014 API-key format invalid`: the endpoint is live and wants a key. **Caveat: api.binance.com refuses US IP addresses (HTTP 451).** GitHub Actions and Netlify run in the US, so the scheduled job may need to run elsewhere for Binance (options in the summary below). |
| Bybit | `GET /v5/asset/coin/query-info` | exists | **read-only key** | answered `10001 apiKey is missing` |
| OKX | `GET /api/v5/asset/currencies` | exists | **read-only key + passphrase** | answered `50103 OK-ACCESS-KEY can not be empty` |
| KuCoin | `GET /api/v3/currencies/USDT` | **yes, public** | none | 19 USDT networks with fee, minimum, withdraw on/off and confirmations (e.g. TRC20 1.99, ERC20 5.5, Polygon 0.8, Arbitrum 1, TON 0.5) |
| Bitget | `GET /api/v2/spot/public/coins?coin=USDT` | **yes, public** | none | 12 USDT networks with fee, minimum, deposit and withdraw confirmations (e.g. TRC20 1.5, ERC20 2, BEP20 0.01, Arbitrum 0.1, SOL 0.5, TON 0.15) |
| Crypto.com | `public/get-currency-networks` | NO (404) | private version needs a key | the Exchange fee page is a 5 KB JavaScript shell with no numbers in the HTML → **manual sheet**, unless you have a Crypto.com Exchange account for a read-only key |
| Rain | `rain.com/fees` and 3 variants | NO (404) | – | no public fee page found; fees live in the app/help centre → **manual sheet** |
| BitOasis | `bitoasis.net/en/fees` | NO (403) | – | bot protection blocks scripts → **manual sheet** |
| CoinMENA | `coinmena.com/fees` → redirects to a blog post | yes (HTML, 1.1 MB) | none | the page contains the fee table (USDT rows) inside a Next.js payload. Scrapable today but fragile → **manual sheet**, with a helper script that extracts the table to speed up the weekly check |

So: **5 exchanges by API** (Binance, Bybit, OKX with keys; KuCoin, Bitget without), **4 by manual sheet** (Rain, BitOasis, CoinMENA, Crypto.com).

## Corrections to the spec, from real data
- Ethereum USDT transfer gas is ≈ 46.5k today (estimateGas), not 65k. The fetcher will measure it, with 65k only as a sanity ceiling.
- Tron energy for a USDT transfer is far above the old 14.6k / 29.6k figures because of the dynamic energy penalty on the USDT contract (64k / 130k today). The fetcher must call `triggerconstantcontract` every run; the penalty moves.
- Solana priority fees are mostly zero at the median; the "typical" fee should be shown as base + a p75/p90 priority tip, with the token-account rent shown separately for first-time recipients.

## Keys and accounts (all free, read-only)
| Variable | Needed for | Required? |
|---|---|---|
| `BINANCE_API_KEY`, `BINANCE_API_SECRET` | Binance withdrawal fees | yes |
| `BYBIT_API_KEY`, `BYBIT_API_SECRET` | Bybit withdrawal fees | yes |
| `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_PASSPHRASE` | OKX withdrawal fees | yes |
| `TRONGRID_API_KEY` | higher TronGrid limits | optional (recommended: free account at trongrid.io) |
| `TONAPI_KEY` | higher tonapi limits | optional |
| `COINGECKO_API_KEY` | demo key, higher limits | optional |
| `CRYPTOCOM_API_KEY`, `CRYPTOCOM_API_SECRET` | Crypto.com fees by API instead of manual | optional |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` or `ALERT_EMAIL` | alerts (phase 6) | one of them |

---

## Script log (raw)

Run: 2026-10-19T17:41:30.741Z from this Mac. Raw responses in `data/raw/discovery/`.

| Source | Works | Status | Time | Key needed | Rate-limit headers | What came back |
|---|---|---|---|---|---|---|
| tron.chainparameters | yes | 200 | 354 ms | no | – | {"getCreateAccountFee":100000,"getTransactionFee":1000,"getCreateNewAccountFeeInSystemContract":1000000,"getEnergyFee":100} |
| tron.energy.existing | yes | 200 | 113 ms | no | – | {"energy_used":64285,"energy_penalty":49635,"result":true} |
| tron.energy.new | NO | 429 | 45 ms | no | – | {} |
| tron.tronscan.chainparams | NO | 429 | 494 ms | no | – | 1 |
| eth.gasPrice | yes | 200 | 155 ms | no | – | {"gwei":0.157181443} |
| eth.feeHistory | yes | 200 | 65 ms | no | – | {"baseFeeGwei":0.157854639,"p50PriorityGwei":0.1} |
| eth.usdtTransferGas | yes | 200 | 64 ms | no | – | {"gas":46479} |
| sol.priorityFees | yes | 200 | 221 ms | no | – | {"samples":150,"p50_microLamportsPerCU":0,"max":468750} |
| sol.rentTokenAccount | yes | 200 | 55 ms | no | – | {"lamports":1488440,"sol":0.00148844} |
| bsc.gasPrice | yes | 200 | 157 ms | no | – | {"gwei":0.05} |
| polygon.gasPrice | yes | 200 | 137 ms | no | – | {"gwei":180.458575502} |
| polygon.feeHistory | yes | 200 | 61 ms | no | – | {"baseFeeGwei":153.605754943,"p50PriorityGwei":75} |
| arb.gasPrice | yes | 200 | 202 ms | no | – | {"gwei":0.02003} |
| arb.usdtTransferGas | yes | 200 | 122 ms | no | – | {"gas":45214} |
| ton.config | yes | 200 | 172 ms | no | – | {"keys":["0","1","2","4","5","7","8","9"]} |
| ton.toncenter.config | yes | 200 | 148 ms | no | – | {"ok":true,"type":"tvm.cell"} |
| ton.usdtJettonTx | yes | 200 | 51 ms | no | – | {"txs":3,"total_fees_nanoton":[449269,495219,449322]} |
| btc.fees | yes | 200 | 161 ms | no | – | {"fastestFee":3,"halfHourFee":3,"hourFee":1,"economyFee":1,"minimumFee":1} |
| btc.mempoolBlocks | yes | 200 | 55 ms | no | – | {"blocks":8,"nextMedianFee":2.021154495330258} |
| price.coingecko | yes | 200 | 258 ms | no | – | {"tron":0.330915,"ethereum":2397.14,"solana":104.02,"binancecoin":726.52,"polygon-ecosystem-token":0.092135,"the-open-network":1.35,"bitcoin":81865,"tether":0.9 |
| price.binanceTicker | yes | 200 | 417 ms | no | x-mbx-used-weight-1m=4 | {"BTCUSDT":81934.81,"ETHUSDT":2399.57,"BNBUSDT":727.12,"TRXUSDT":0.3312,"SOLUSDT":104.08,"TONUSDT":1.6,"POLUSDT":0.09217} |
| price.okxTicker | yes | 200 | 348 ms | no | – | {"count":1184,"trx":"0.33114"} |
| binance.withdrawFees | NO | 400 | 272 ms | yes (read-only key, signed request) | – | {"code":-2014,"msg":"API-key format invalid."} |
| bybit.coinInfo | yes | 200 | 349 ms | yes (read-only key) | – | {"retCode":10001,"retMsg":"Request parameter error: apiKey is missing"} |
| okx.currencies | NO | 401 | 212 ms | yes (read-only key + passphrase) | – | {"code":"50103","msg":"Request header OK-ACCESS-KEY can not be empty."} |
| kucoin.currencies | yes | 200 | 361 ms | no | – | {"chains":["APT:0.5/min 1","Asset Hub(Polkadot):1/min 10","OPTIMISM:1/min 3","TON:0.5/min 1","KCC:0.5/min 1","SOL:1.5/min 3","TON:0.5/min 1","BEP20:1/min 10","C |
| bitget.coins | yes | 200 | 402 ms | no | – | {"chains":["ERC20:2/min 5","TRC20:1.5/min 5","BEP20:0.01/min 5","ArbitrumOne:0.1/min 5","SOL:0.5/min 5","Optimism:0.014/min 5","Polygon:0.07/min 5","AVAXC-Chain |
| cryptocom.currencyNetworks | NO | 404 | 440 ms | no | – | {"keys":null} |
| cryptocom.feePage | yes | 200 | 1332 ms | no | – | {"html":5373,"mentionsUSDT":false} |
| rain.feePage | NO | 404 | 207 ms | no | – | {"html":21190,"mentionsUSDT":false,"mentionsFee":true} |
| bitoasis.feePage | NO | 403 | 186 ms | no | – | {"html":4573,"mentionsUSDT":false,"mentionsFee":false} |
| coinmena.feePage | yes | 200 | 2598 ms | no | – | {"html":1110147,"mentionsUSDT":true,"mentionsFee":true} |

## Notes
- **tron.chainparameters:** energy price (sun) + bandwidth price; free, optional TRON-PRO-API-KEY raises limits
- **tron.energy.existing:** energy a 100 USDT transfer would use (existing vs never-funded recipient)
- **tron.energy.new:** energy a 100 USDT transfer would use (existing vs never-funded recipient)
- **tron.tronscan.chainparams:** alternative source for the same parameters
- **eth.gasPrice:** public RPC, no key
- **eth.usdtTransferGas:** estimateGas for a 100 USDT ERC-20 transfer from Binance hot wallet to a funded address
- **sol.priorityFees:** public RPC; USDT mint; base fee is 5000 lamports/signature
- **sol.rentTokenAccount:** rent for a new token account (165 bytes)
- **arb.gasPrice:** Arbitrum official public RPC
- **arb.usdtTransferGas:** estimateGas on Arbitrum already includes the L1 data component
- **ton.config:** tonapi public (rate limited without key, ~1 rps)
- **ton.toncenter.config:** toncenter public: gas/fwd price config (key optional, 1 rps without)
- **ton.usdtJettonTx:** recent USDT jetton master txs: see real total_fees for a jetton transfer
- **btc.fees:** mempool.space free, no key
- **price.coingecko:** free tier: ~30 calls/min, no key (demo key optional)
- **price.binanceTicker:** exchange public ticker, no key: fallback price source
- **price.okxTicker:** second fallback
- **binance.withdrawFees:** expect 401 without key: proves the endpoint exists
- **bybit.coinInfo:** expect retCode 10003/10004 without key
- **okx.currencies:** expect code 50103/50111 without key
- **kucoin.currencies:** public
- **bitget.coins:** public
- **cryptocom.currencyNetworks:** Crypto.com Exchange: documented as needing auth in some versions; check
- **cryptocom.feePage:** fee page (manual fallback)
- **rain.feePage:** Rain (Bahrain/UAE): manual sheet likely
- **bitoasis.feePage:** BitOasis (UAE): manual sheet likely
- **coinmena.feePage:** CoinMENA (Bahrain): manual sheet likely
