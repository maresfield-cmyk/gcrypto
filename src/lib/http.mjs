// fetch with timeout, one retry, and a raw copy on disk (data/raw/<source>/latest.json + a timestamped copy pruned after 7 days)
import fs from 'node:fs';
import path from 'node:path';
const RAW = 'data/raw';
export async function getJson(source, url, { method = 'GET', body, headers = {}, timeout = 15000, retries = 1 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'user-agent': 'gcrypto-fee-index/0.1 (+https://crypto.gulfarcade.com)', ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, signal: ctl.signal });
      clearTimeout(tm);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
      const json = JSON.parse(text);
      saveRaw(source, { observed_at: new Date().toISOString(), url, body: body ?? null, status: res.status, response: json });
      return json;
    } catch (e) { clearTimeout(tm); last = e; if (i < retries) await new Promise((r) => setTimeout(r, 1500)); }
  }
  throw last;
}
export const rpc = (source, url, method, params = []) => getJson(source, url, { method: 'POST', body: { jsonrpc: '2.0', id: 1, method, params } }).then((j) => { if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`); return j.result; });
export function saveRaw(source, obj) {
  const dir = path.join(RAW, source); fs.mkdirSync(dir, { recursive: true });
  const ts = obj.observed_at.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(obj, null, 1));
  fs.writeFileSync(path.join(dir, `${ts}.json`), JSON.stringify(obj));
  const cutoff = Date.now() - 7 * 86400e3;
  for (const f of fs.readdirSync(dir)) if (f !== 'latest.json' && fs.statSync(path.join(dir, f)).mtimeMs < cutoff) fs.unlinkSync(path.join(dir, f));
}
export const rawRef = (source) => `data/raw/${source}/latest.json`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const hexNum = (h) => Number(BigInt(h));
