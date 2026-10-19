// Native-coin prices in USD: CoinGecko (one call, cached 5 min on disk), falling back to Binance then OKX tickers.
import fs from 'node:fs';
import { getJson } from './http.mjs';
const CACHE = 'data/raw/prices/cache.json', TTL = 5 * 60e3;
export async function prices(networks, extraIds = []) {
  const ids = [...new Set([...networks.map((n) => n.coingecko), ...extraIds])];
  if (fs.existsSync(CACHE)) { const c = JSON.parse(fs.readFileSync(CACHE)); if (Date.now() - Date.parse(c.observed_at) < TTL && ids.every((i) => c.usd[i])) return c; }
  const out = { observed_at: new Date().toISOString(), source: '', usd: {} };
  try {
    const key = process.env.COINGECKO_API_KEY;
    const j = await getJson('prices', `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd${key ? `&x_cg_demo_api_key=${key}` : ''}`);
    for (const i of ids) if (j[i] && j[i].usd > 0) out.usd[i] = j[i].usd;
    out.source = 'https://api.coingecko.com/api/v3/simple/price';
  } catch (e) { out.error = `coingecko: ${e.message}`; }
  const missing = ids.filter((i) => !out.usd[i]);
  if (missing.length) {
    try {
      const syms = networks.filter((n) => missing.includes(n.coingecko)).map((n) => n.binance_symbol);
      const j = await getJson('prices-binance', `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify([...new Set(syms)]))}`);
      for (const n of networks) { const t = j.find((x) => x.symbol === n.binance_symbol); if (t && !out.usd[n.coingecko]) out.usd[n.coingecko] = +t.price; }
      out.source += (out.source ? ' + ' : '') + 'https://api.binance.com/api/v3/ticker/price';
    } catch (e) { out.error = (out.error ? out.error + '; ' : '') + `binance: ${e.message}`; }
  }
  const still = ids.filter((i) => !out.usd[i]);
  if (still.length) {
    try {
      const j = await getJson('prices-okx', 'https://www.okx.com/api/v5/market/tickers?instType=SPOT');
      for (const n of networks) { const inst = n.binance_symbol.replace('USDT', '-USDT'); const t = j.data.find((x) => x.instId === inst); if (t && !out.usd[n.coingecko]) out.usd[n.coingecko] = +t.last; }
      out.source += (out.source ? ' + ' : '') + 'https://www.okx.com/api/v5/market/tickers';
    } catch (e) { out.error = (out.error ? out.error + '; ' : '') + `okx: ${e.message}`; }
  }
  if (Object.keys(out.usd).length) { fs.mkdirSync('data/raw/prices', { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(out, null, 1)); }
  else if (fs.existsSync(CACHE)) { const c = JSON.parse(fs.readFileSync(CACHE)); c.stale = true; c.error = out.error; return c; }
  return out;
}
