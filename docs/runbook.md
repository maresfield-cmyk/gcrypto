# Runbook: Crypto Fee & Transfer Index

Site: https://crypto.gulfarcade.com · Repo: `gcrypto` · Everything runs from GitHub Actions (`.github/workflows/update.yml`) and is hosted on GitHub Pages; every step also runs locally on a Mac.

## Local commands
```
cp .env.example .env            # fill in the keys (read-only!)
npm ci
node scripts/fetch-networks.mjs # Layer 1: 8 networks + prices -> data/out/networks.json (~15 s)
node scripts/fetch-exchanges.mjs# Layer 2: exchange fees -> data/out/exchanges.json, usdt-matrix.json, unmapped.json
node scripts/alert.mjs          # evaluate alerts (emails only with SMTP settings)
node scripts/run.mjs all        # all of the above + rollup + publish + site build when values moved
node scripts/publish-data.mjs && npx astro build && npx astro preview   # look at the site locally
node scripts/discover.mjs       # re-verify every data source (docs/discovery-report.md)
node scripts/export-strings.mjs # strings + context for translators
```

## Weekly (20 minutes)
1. Open the four manual exchanges' fee pages (links in `data/manual/exchanges.yml`): Rain, BitOasis, CoinMENA, Crypto.com.
2. Compare with `data/manual/fees-manual.csv`; correct any fee or minimum; set `last_verified` to today on every row you checked (even if unchanged). The site shows the date; rows older than 14 days email you.
3. Glance at the week's alert emails. `data/logs/alerts.log` has the full list.

## Monthly
- `exchanges.yml`: licensing rows and deposit currencies. Set `verified: true` and `last_verified` once checked against the regulator's register (links in the file). Unverified rows show "unverified" on the site.
- (Layer 3 timed transfers are not built; `data/manual/transfers.csv` can be added later.)

## Adding a network
1. `config/networks.json`: add the entry (id, coin, price id, block time, confirmations with a source, sanity cap, RPC/contract).
2. A fetcher: EVM chains need only config; others get a file in `src/fetch/`. Register it in `scripts/fetch-networks.mjs` (`FETCH`).
3. `config/network-map.json`: the id in `ids`, plus every exchange's spelling of it in `aliases`.
4. Run `node scripts/run.mjs all`; the pages, widgets and OG images are generated from the data.

## Adding an exchange
- With an API: a file in `src/fetch/exchanges/`, registered in `scripts/fetch-exchanges.mjs` (`API`), keys in `.env.example` and the workflow.
- Without: rows in `fees-manual.csv` and an entry (`fee_source: manual`) in `exchanges.yml`.
- Unknown network names stop at `data/out/unmapped.json` and an alert; add them to the map, never guess.

## When a source changes its API
The site keeps the last good value with a visible timestamp; you get an email after 2 hours of failure. Run `node scripts/discover.mjs`, read the raw response in `data/raw/<source>/latest.json`, fix the fetcher, run `node scripts/fetch-networks.mjs` and check the value against a block explorer.

## Rotating API keys
Create the new read-only key (no trade/withdraw permission), update the GitHub secret and your local `.env`, run the workflow by hand (Actions → update → Run workflow), then delete the old key at the exchange.

Bybit: the account is on the EU entity, so the key works only against `api.bybit.eu` (the default in `src/fetch/exchanges/bybit.mjs`); `api.bybit.com` answers `10003 API key is invalid`. Permission needed: Assets → Wallet → Account Transfer (read-only). A key without an IP restriction expires after 90 days: created 2026-10-20, renew by 2027-01-15.

## Known issue: Binance from GitHub's US runners
`api.binance.com` returns HTTP 451 to US addresses. If the Binance step fails in Actions: (a) run the job on a self-hosted runner outside the US (a Mac that is always on works), or (b) set `fee_source: manual` for Binance in `exchanges.yml` and keep its rows in the manual sheet.

## Rebuild policy
The site is rebuilt and published only when a network fee moved more than 5% or an alert fired (`data/out/run.json` → `rebuild`), or on the 6-hourly exchange run. Between rebuilds the pages refresh their numbers from `/data/networks.json` in the browser.
