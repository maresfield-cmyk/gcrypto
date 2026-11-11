import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
// Static site for crypto.gulfarcade.com. Pages are prerendered from data/out/*.json (run the fetch scripts first).
// URLs end with a slash (/en/networks/tron/), as in the spec.
// Patrick, 11 Nov 2026: Google has dropped the 52 noindex template pages, so they come out of the sitemap (same rule as Layout.astro).
const NOINDEX = /^\/[a-z]{2}\/(history|networks|assets|calculator)\//;
export default defineConfig({ site: 'https://crypto.gulfarcade.com', output: 'static', build: { format: 'directory' }, trailingSlash: 'always', integrations: [sitemap({ filter: (p) => !p.includes('/embed/') && p !== 'https://crypto.gulfarcade.com/' && !p.includes('/404') && !NOINDEX.test(new URL(p).pathname) })] });
