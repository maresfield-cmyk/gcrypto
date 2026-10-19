# GulfCrypto Fee & Transfer Index

Standalone data site for **crypto.gulfarcade.com**: what a USDT or BTC transfer costs right now on 8 networks, and what 9 exchanges charge to withdraw. Spec: `docs/SPEC.md`. How it runs and what to do each week: `docs/runbook.md`.

- Data scripts (no dependencies beyond `yaml`, `sharp`, `nodemailer`): `scripts/` and `src/fetch/`, output in `data/out/`.
- Site: Astro, static, built from `data/out/*.json`; strings in `locales/en.json` (Arabic to follow in `locales/ar.json`).
- Scheduler: `.github/workflows/update.yml` (every 15 min / 6 h), deploys to Netlify when values move.

Quick start: `cp .env.example .env`, `npm ci`, `node scripts/run.mjs all`, `npx astro preview`.
