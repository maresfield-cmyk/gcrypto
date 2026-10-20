# Runbook: Crypto Fee & Transfer Index

Site: https://crypto.gulfarcade.com · Repo: `gcrypto` · Everything runs from GitHub Actions (`.github/workflows/update.yml`) and is hosted on GitHub Pages; every step also runs locally on a Mac.

## Local commands
```
cp .env.example .env            # fill in the keys (read-only!)
npm ci
node scripts/fetch-networks.mjs # Layer 1: 8 networks + prices -> data/out/networks.json (~15 s)
node scripts/fetch-exchanges.mjs# Layer 2: exchange fees -> data/out/exchanges.json, usdt-matrix.json, unmapped.json
node scripts/alert.mjs          # evaluate alerts (emails only with SMTP settings); add --test to send a test email
node scripts/run.mjs all        # all of the above + rollup + publish + site build when values moved
node scripts/publish-data.mjs && npx astro build && npx astro preview   # look at the site locally
node scripts/discover.mjs       # re-verify every data source (docs/discovery-report.md)
node scripts/export-strings.mjs # strings + context for translators
```

## Weekly (20 minutes)
1. Open the manual exchanges' fee pages (links in `data/manual/exchanges.yml`): Bybit (the Crypto Deposit/Withdrawal Status page: click a coin to see each chain's fee and minimum), Rain, BitOasis, CoinMENA, Crypto.com. A fee of `network` in the sheet means the exchange passes the live network fee through (BitOasis); re-check that its page still says so.
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

OKX: the account is on the EEA entity, so the key works only against `eea.okx.com` (the default in `src/fetch/exchanges/okx.mjs`); `www.okx.com` answers `50119 API key doesn't exist`. Checked 2026-10-20: the EEA fees match OKX's public global fee endpoint for every overlapping coin, so the EEA data is used as is. Permission: Read only.

Bybit: the account is on the EU entity, so the key works only against `api.bybit.eu` (the default in `src/fetch/exchanges/bybit.mjs`); `api.bybit.com` answers `10003 API key is invalid`. Permission needed: Assets → Wallet → Account Transfer (read-only). A key without an IP restriction expires after 90 days: created 2026-10-20, renew by 2027-01-15.

## Binance from GitHub's US runners
`api.binance.com` (the signed API) returns HTTP 451 to US addresses, which is where GitHub-hosted runners live. Since 2026-10-20 the fetcher uses the public endpoint behind binance.com's fee page first (no key, works from the US, identical figures) and only falls back to the signed API. If the public endpoint ever disappears, the signed fallback still works from your Mac (`node scripts/run.mjs all`), or switch Binance to `fee_source: manual`.

## Rebuild policy
The site is rebuilt and published only when a network fee moved more than 5% or an alert fired (`data/out/run.json` → `rebuild`), or on the 6-hourly exchange run. Between rebuilds the pages refresh their numbers from `/data/networks.json` in the browser.
