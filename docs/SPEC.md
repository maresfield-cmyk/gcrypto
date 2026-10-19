# Build spec: Gulf Crypto Fee & Transfer Index

Host: `crypto.gulfarcade.com`, a standalone subdomain of gulfarcade.com. It is a completely separate site: its own repo, deploy, nav, footer and analytics. **No links to, and no shared components with, the main gulfarcade.com site.** One neutral "A Gulf Arcade project" line in the footer is the maximum.

Goal: the reference page Arabic crypto media, Telegram groups and Gulf users link to when they ask "what does it cost to send USDT right now, and which exchange is cheapest to withdraw from?" Data must be real, timestamped and reproducible.

Language plan: build everything in English first, with every user-facing string in a locale file, so an Arabic (RTL) version is the last phase, not a rewrite.

Budget: £0 for data. Free public APIs and free read-only exchange API keys only. No paid data providers.

Read the whole spec before writing code. Work in the phases at the end and stop for my review after each phase.

---

## 0. First steps

1. Propose the stack. Preferred: a static site (Astro or Next static export) rebuilt by a scheduled job, reading JSON from `data/out/`. Hosting on Cloudflare Pages, Vercel or Netlify as a separate project with the subdomain attached. Tell me what you picked and why.
2. **API discovery script.** Before building anything, verify each data source below actually works today: call it, print a sample response, note rate limits and whether a key is required. Report the results and stop. Do not assume an endpoint from memory still exists.

---

## 1. Scope

### Networks (Layer 1, fully automatic)
Track the live cost of one standard USDT transfer (and one native-coin transfer where relevant) on:

| Network | Token to price | Candidate free sources (verify in discovery) |
|---|---|---|
| Tron (TRC-20) | USDT | TronGrid / Tronscan public API: energy + bandwidth price, energy needed for a USDT transfer (differs for new vs existing recipient addresses; show both), TRX price |
| Ethereum (ERC-20) | USDT | Public RPC `eth_gasPrice` / `eth_feeHistory`, or Etherscan free tier; gas used ≈ 65,000 for a USDT transfer (verify from recent txs) |
| Solana | USDT (SPL) | Public RPC: base fee + typical priority fee; include rent for a new token account |
| BNB Smart Chain (BEP-20) | USDT | Public RPC |
| Polygon PoS | USDT | Public RPC |
| Arbitrum One | USDT | Public RPC (L2 fee + L1 data component) |
| TON | USDT (jetton) | TON Center / tonapi public endpoints |
| Bitcoin | BTC | mempool.space free API: fee estimates by priority (fastest, ~30 min, ~1 hour), typical tx size |

For each: fee in native coin, fee in USD, and estimated time to final confirmation at current congestion. Native coin prices from a free source (CoinGecko free tier or the exchanges' own public ticker endpoints, which need no key). Cache prices; never hammer the price API.

### Exchanges (Layer 2, API where possible, otherwise manual)
USDT and BTC withdrawal fees and minimums, per supported network, for:

| Exchange | Likely source |
|---|---|
| Binance | Public withdrawal-fee endpoint, needs a free read-only API key |
| Bybit | Same pattern |
| OKX | Same pattern |
| KuCoin | Same pattern |
| Bitget | Same pattern |
| Rain (Bahrain/UAE) | Fee page, manual or scraped |
| BitOasis (UAE) | Fee page, manual or scraped |
| CoinMENA (Bahrain) | Fee page, manual or scraped |
| Crypto.com | API or fee page |

API keys live in env vars, read-only, **no trading or withdrawal permissions**. Discovery must confirm which exchanges expose fees via API and which need the manual sheet.

Also record per exchange: licensing status in the Gulf (VARA Dubai, ADGM, CBB Bahrain, CMA/SAMA position in Saudi), supported deposit currencies (AED, SAR, BHD, KWD, QAR), and P2P availability. This is a hand-maintained table in `data/manual/exchanges.yml`, with a "last verified" date per row.

### Timed real transfers (Layer 3, manual, monthly)
I will occasionally run real withdrawals and record them. Provide a sheet/CSV format:
`date, exchange, asset, network, amount, fee_charged, requested_at, arrived_at, minutes, notes`
The site shows these as a dated "observed withdrawal times" table per exchange, clearly labelled as spot checks, never as a live metric.

### Out of scope
Trading fees, spreads, staking, "how to buy" guides, price predictions, anything promotional. No affiliate links in phase 1; if added later they go in a clearly labelled block on exchange pages only.

---

## 2. Data layer

```
data/
  raw/                  # cached API responses with timestamps
  manual/exchanges.yml  # hand-maintained exchange facts
  manual/fees-manual.csv # fees for exchanges without an API, with last_verified date
  manual/transfers.csv   # Layer 3 observations
  history/               # one row per snapshot per network (append-only, for charts)
  out/                   # JSON the site reads
```

Rules:
- Every number carries `observed_at` (UTC) and `source`.
- Normalise token and network names across exchanges into one internal ID set (e.g. Binance "TRX" network vs OKX "USDT-TRC20" vs Bybit "TRC20" → `usdt-tron`). Keep a mapping file and fail loudly on an unmapped name.
- Validate: no negative fees, no fee above a sanity cap, no price older than 1 hour, network fee within 10× of the 7-day median (else flag as an anomaly, keep the previous value, and alert me).
- History: keep 15-minute snapshots for 30 days, hourly for a year, roll up older data; keep the repo small.
- If any source fails, the page keeps the last good value with a visible "last updated" time; the build never fails because of one API.

---

## 3. Calculations

- **Network cost in USD** = fee in native units × native price. For Tron, show the no-energy case (burning TRX) as the default, since that's what most users pay, with a note on staking for energy.
- **Total cost to withdraw** = exchange withdrawal fee (in USDT, converted) + nothing else (the exchange pays the network). Make it clear the network fee is what you pay when sending from your own wallet, and the exchange fee is what you pay when withdrawing from the exchange. Users constantly confuse these; the UI must separate them.
- **Calculator:** inputs: amount, asset (USDT/BTC), from (exchange or own wallet), network. Output: fee, % of amount, estimated time, and the cheapest alternative network on that exchange.
- **Leaderboards:** cheapest network right now; cheapest exchange for USDT withdrawal per network; best overall "send $100 / $1,000 / $10,000" combos.
- **Time estimates:** block time × confirmations required by major exchanges for deposits (put the confirmation counts in config with source links), plus current congestion from the fee data.

---

## 4. Pages

All server-rendered or static, full content with JavaScript off; the live numbers are in the HTML at build time and refreshed client-side if the user keeps the page open.

- `/`: hub. "Cost to send $100 USDT right now" across all networks (cards or a table), cheapest exchange for USDT withdrawals, Bitcoin fee tiers, last updated, 7-day sparkline per network.
- `/calculator/`
- `/networks/{network}/`: live fee, 7-day and 30-day charts, how the fee is made up, time to confirm, which exchanges support this network for USDT.
- `/exchanges/{exchange}/`: withdrawal fee table (asset × network), minimums, Gulf licensing and currency support, observed transfer times (Layer 3), last verified date.
- `/compare/usdt-withdrawal-fees/`: the big comparison table, sortable.
- `/history/`: how fees have moved; weekly "cheapest network" winner.
- `/methodology/`: exactly how each number is produced, sources with links, update cadence, limitations, the Saudi regulatory note (SAMA's position; the site is informational only), how to cite, embed code.
- `/embed/`: widget code.

Design: data-tool aesthetic, mobile-first, fast on mobile networks. Dark mode support. Every data block shows its timestamp. Open Graph image auto-generated for the hub and each network page ("Tron USDT fee right now: $0.42"). Structured data: `Dataset` on methodology, breadcrumbs.

**Do not use any exchange's logo or brand assets without checking their brand guidelines; plain text names are fine.**

---

## 5. Embeddable widget
`/embed/cheapest-network/` and `/embed/network/{network}/`: small iframe, auto-refreshing, "Data: <site name>" credit link with a **branded anchor only**. No trackers inside the iframe.

---

## 6. Automation & monitoring
- Scheduled job (GitHub Actions or the host's cron) every 15 minutes for network fees and prices, every 6 hours for exchange API fees, plus a manual trigger.
- Steps: fetch → validate → write history → write out JSON → rebuild only if values changed meaningfully (define thresholds so the site isn't rebuilt every 15 minutes for noise; otherwise serve the JSON to the client-side refresh).
- Alerts (ask me: email or Telegram) on: a source failing for more than 2 hours, an anomaly flag, an exchange's manual fee row older than 14 days.
- Keys as repository secrets; a `.env.example` listing every variable.
- Scripts for every step so I can run it locally on my Mac.

---

## 7. i18n (do this last, but design for it from day one)
- All strings in `locales/en.json` from the first commit; no hard-coded text in components.
- Number, currency and date formatting via `Intl` with the active locale.
- Layout must work in RTL: use logical CSS properties (`margin-inline-start`, etc.), test with `dir="rtl"` early even while the copy is English.
- URL scheme: `/en/...` and `/ar/...` with `hreflang`, Arabic as the default locale once ready.
- Arabic copy will be supplied by my translators; provide them a single export of all strings with context notes per key.

---

## 8. Runbook (`docs/runbook.md`)
- Weekly (20 min): verify manual fee rows for Rain, BitOasis, CoinMENA and any exchange without an API; update `last_verified`.
- Monthly: Layer 3 transfer tests, add rows to `transfers.csv`.
- Adding a network or an exchange.
- What to do when a source changes its API.
- Rotating API keys.

---

## 9. Build phases (stop after each)
1. **Discovery:** stack proposal + API verification report (sample responses, rate limits, key requirements, which exchanges need manual data).
2. **Layer 1:** network fee fetchers, prices, validation, history, `out/` JSON. Show me a live snapshot and a day of history.
3. **Layer 2:** exchange fee fetchers + manual files + name normalisation. Show me the full USDT withdrawal-fee matrix and a list of unmapped names.
4. **Pages:** hub, calculator, network and exchange pages, compare, methodology. Preview URL, checked on mobile and in RTL.
5. **Widget, OG images, structured data, history page.**
6. **Automation, alerts, runbook,** one end-to-end scheduled run with logs.
7. **Arabic locale:** wire up `/ar/`, import the translated strings, RTL QA.

## Acceptance checks
- Every published number can be traced to a cached raw response or a manual row with a date.
- Network fees match a manual check against a block explorer at the same minute, within rounding.
- Exchange fees match the exchange's own fee page on the day of the check.
- Hub Lighthouse mobile performance ≥ 90; full content with JS disabled.
- The scheduled job uses no paid service and stays well within every free rate limit.
