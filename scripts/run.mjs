// One scheduled run: fetch (networks always; exchanges when asked) -> validate -> history -> out JSON -> alerts -> decide whether
// the site needs a rebuild. Usage: node scripts/run.mjs networks | all     (writes data/out/run.json for the workflow)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const mode = process.argv[2] || 'networks';
const sh = (c) => { console.log('$ ' + c); execSync(c, { stdio: 'inherit' }); };
const started = Date.now();
sh('node scripts/fetch-networks.mjs');
if (mode === 'all') { sh('node scripts/fetch-exchanges.mjs'); sh('node scripts/rollup.mjs'); }
sh('node scripts/alert.mjs');
sh('node scripts/telegram.mjs auto');   // channel digest once a day + sharp-move alerts; no-op without a token
const net = JSON.parse(fs.readFileSync('data/out/networks.json'));
const rebuild = mode === 'all' || net.rebuild.needed;
fs.writeFileSync('data/out/run.json', JSON.stringify({ ran_at: new Date().toISOString(), mode, seconds: Math.round((Date.now() - started) / 1000), rebuild, moved: net.rebuild.moved }, null, 1));
console.log(`run done in ${Math.round((Date.now() - started) / 1000)}s; rebuild: ${rebuild}`);
if (rebuild) { sh('node scripts/publish-data.mjs'); sh('npx astro build'); }
