// Build-time data access for the pages: data/out JSON, history CSV and the locale strings.
import fs from 'node:fs';
export const SITE_URL = 'https://crypto.gulfarcade.com';
export const LANGS = ['en', 'ar'] as const;      // locales/<lang>.json; Arabic strings from the translators (2026-10-20)
export type Lang = (typeof LANGS)[number];
export const dir = (lang: string) => (lang === 'ar' ? 'rtl' : 'ltr');
// Numbers, money and percentages always use Western digits and the $ prefix (what Gulf crypto media use); dates follow the page language.
export const NUM = 'en';
export const dateLocale = (lang: string) => (lang === 'ar' ? 'ar-AE-u-nu-latn' : lang);
// In right-to-left text a number like $0.0005 or 20/10/2026 would be re-ordered by the bidi algorithm; isolating it keeps it as written.
export const iso = (lang: string, s: string) => (lang === 'ar' ? `\u2066${s.replace(/\u200f/g, '')}\u2069` : s);   // also drops the RTL marks Arabic date formats insert
export const LANG_NAMES: Record<string, string> = { en: 'English', ar: 'العربية' };
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
  let s = strings[lang]?.[key] ?? strings.en[key] ?? key.replace(/^case\./, '').replace(/_/g, ' ');
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export const fmtUsd = (lang: string, v: number | null | undefined, max = 4) => v == null ? '–' : iso(lang, new Intl.NumberFormat(NUM, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: v < 0.01 ? max : v < 1 ? 3 : 2 }).format(v));
export const fmtNum = (lang: string, v: number | null | undefined, max = 6) => v == null ? '–' : iso(lang, new Intl.NumberFormat(NUM, { maximumSignificantDigits: 4, maximumFractionDigits: max }).format(v));
export const fmtTime = (lang: string, when: string | null | undefined) => when ? iso(lang, new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(when)) + ' UTC') : '–';
export const fmtDate = (lang: string, when: string | null | undefined) => when ? iso(lang, new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(when))) : '–';
export function history() {
  if (!fs.existsSync('data/history/networks.csv')) return [];
  return fs.readFileSync('data/history/networks.csv', 'utf8').trim().split('\n').slice(1).map((l) => { const [ts, asset, network, fee_native, fee_usd, , , flags] = l.split(','); return { ts, asset, network, fee_native: +fee_native, fee_usd: +fee_usd, flags }; }).filter((r) => !r.flags);
}
/** cells of one asset across its networks, cheapest first */
export const cellsOf = (F: any, assetId: string) => Object.values(F.assets[assetId].networks).filter((x: any) => x.fee_usd != null).sort((a: any, b: any) => a.fee_usd - b.fee_usd) as any[];
export const cheapestOf = (F: any, assetId: string) => cellsOf(F, assetId)[0];

// Percent of an amount: two decimals normally, but tiny shares keep two significant figures (0.0032% rather than 0.00%).
export function fmtPct(lang: string, feeUsd: number, amount: number): string {
  const p = (feeUsd / amount) * 100;
  if (!isFinite(p)) return '–';
  const digits = p >= 0.1 ? 2 : Math.max(2, 1 - Math.floor(Math.log10(p || 1)));
  return iso(lang, new Intl.NumberFormat(NUM, { minimumFractionDigits: 2, maximumFractionDigits: Math.min(digits, 6) }).format(p) + '%');
}
