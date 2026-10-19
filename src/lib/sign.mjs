import { createHmac } from 'node:crypto';
export const hmacHex = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex');
export const hmacB64 = (secret, msg) => createHmac('sha256', secret).update(msg).digest('base64');
export const env = (k) => (process.env[k] || '').trim();
export class NoKey extends Error { constructor(ex) { super(`${ex}: no API key in .env`); this.noKey = true; } }
