// Build-time data access for the pages: data/out JSON, history CSV and the locale strings.
import fs from 'node:fs';
export const SITE_URL = 'https://crypto.gulfarcade.com';
export const LANGS = ['en'] as const;            // add 'ar' when the Arabic strings arrive (locales/ar.json)
export type Lang = (typeof LANGS)[number];
export const dir = (lang: string) => (lang === 'ar' ? 'rtl' : 'ltr');
const J = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const fees = () => J('data/out/fees.json');
export const matrix = () => J('data/out/matrix.json');
export const exchanges = () => J('data/out/exchanges.json');
export const netConfig = () => J('config/networks.json').networks as any[];
export const assetList = () => Object.values(fees().assets) as any[];
export const defaultAsset = () => assetList().find((a) => a.default) ?? assetList()[0];
const strings: Record<string, Record<string, string>> = {};
for (const l of LANGS) strings[l] = J(`locales/${l}.json`);
export function t(lang: string, key: string, vars: Record<string, string | number> = {}) {
  let s = strings[lang]?.[key] ?? strings.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export const fmtUsd = (lang: string, v: number | null | undefined, max = 4) => v == null ? '–' : new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: v < 0.01 ? max : v < 1 ? 3 : 2 }).format(v);
export const fmtNum = (lang: string, v: number | null | undefined, max = 6) => v == null ? '–' : new Intl.NumberFormat(lang, { maximumSignificantDigits: 4, maximumFractionDigits: max }).format(v);
export const fmtTime = (lang: string, iso: string | null | undefined) => iso ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC' : '–';
export const fmtDate = (lang: string, iso: string | null | undefined) => iso ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)) : '–';
export function history() {
  if (!fs.existsSync('data/history/networks.csv')) return [];
  return fs.readFileSync('data/history/networks.csv', 'utf8').trim().split('\n').slice(1).map((l) => { const [ts, asset, network, fee_native, fee_usd, , , flags] = l.split(','); return { ts, asset, network, fee_native: +fee_native, fee_usd: +fee_usd, flags }; }).filter((r) => !r.flags);
}
/** cells of one asset across its networks, cheapest first */
export const cellsOf = (F: any, assetId: string) => Object.values(F.assets[assetId].networks).filter((x: any) => x.fee_usd != null).sort((a: any, b: any) => a.fee_usd - b.fee_usd) as any[];
export const cheapestOf = (F: any, assetId: string) => cellsOf(F, assetId)[0];
