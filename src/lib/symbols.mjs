// Ticker symbols to try for an asset on an exchange (some list Toncoin as TONCOIN, Polygon as MATIC): config/assets.json exchange_symbols
import fs from 'node:fs';
const A = JSON.parse(fs.readFileSync('config/assets.json')).assets;
export const symbols = (sym) => { const a = A.find((x) => x.symbol === sym); return a && a.exchange_symbols ? a.exchange_symbols : [sym]; };
