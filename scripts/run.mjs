// One scheduled run: fetch (networks always; exchanges when asked) -> validate -> history -> out JSON -> alerts -> decide whether
// rebuild the site. Usage: node scripts/run.mjs networks | all | auto     (writes data/out/run.json for the workflow)
// auto = networks, plus exchanges when the last exchange fetch is about 6 hours old (GitHub skips many scheduled runs).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
let mode = process.argv[2] || 'networks';
if (mode === 'auto') { const m = fs.existsSync('data/out/matrix.json') ? JSON.parse(fs.readFileSync('data/out/matrix.json')).generated_at : null; mode = !m || Date.now() - Date.parse(m) >= 5.75 * 3600e3 ? 'all' : 'networks'; console.log('auto mode ->', mode); }
const sh = (c) => { console.log('$ ' + c); execSync(c, { stdio: 'inherit' }); };
const started = Date.now();
sh('node scripts/fetch-networks.mjs');
if (mode === 'all') { sh('node scripts/fetch-exchanges.mjs'); sh('node scripts/rollup.mjs'); }
sh('node scripts/alert.mjs');
sh('node scripts/telegram.mjs auto');   // channel digest once a day + sharp-move alerts; no-op without a token
const net = JSON.parse(fs.readFileSync('data/out/networks.json'));
// Patrick approved 2026-10-21: rebuild and publish on every run so "Updated" on the site is the time of the last check.
const rebuild = true;
fs.writeFileSync('data/out/run.json', JSON.stringify({ ran_at: new Date().toISOString(), mode, seconds: Math.round((Date.now() - started) / 1000), rebuild, moved: net.rebuild.moved }, null, 1));
console.log(`run done in ${Math.round((Date.now() - started) / 1000)}s; rebuild: ${rebuild}`);
if (rebuild) { sh('node scripts/publish-data.mjs'); sh('npx astro build'); }
