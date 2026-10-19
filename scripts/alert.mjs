// Alerts by email (SMTP via nodemailer; any provider, e.g. a Gmail app password). Rules from the spec:
//   - a source failing for more than 2 hours (first failure time is remembered in data/out/alert-state.json)
//   - an anomaly / validation flag (sent at once, then not again for 6 hours for the same key)
//   - a manual fee row older than 14 days or an unmapped exchange network name (one digest per day)
// Without SMTP settings the alerts are only logged (data/logs/alerts.log), so a missing mailbox never breaks a run.
import fs from 'node:fs';
import nodemailer from 'nodemailer';
if (fs.existsSync('.env')) for (const l of fs.readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const STATE = 'data/out/alert-state.json', now = Date.now();
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE)) : { failing: {}, sent: {} };
const alerts = [...(fs.existsSync('data/out/alerts.json') ? JSON.parse(fs.readFileSync('data/out/alerts.json')) : []), ...(fs.existsSync('data/out/alerts-exchanges.json') ? JSON.parse(fs.readFileSync('data/out/alerts-exchanges.json')) : [])];
const due = [];
const failingNow = new Set();
for (const a of alerts) {
  const key = `${a.type}:${a.network || a.exchange || 'global'}`;
  if (a.type === 'source_failed') {                       // only after 2 hours of continuous failure
    failingNow.add(key); state.failing[key] ??= now;
    if (now - state.failing[key] > 2 * 3600e3 && now - (state.sent[key] || 0) > 6 * 3600e3) { due.push({ key, subject: `Source failing for 2h+: ${a.network || a.exchange}`, body: `${a.detail}\nfirst failure: ${new Date(state.failing[key]).toISOString()}` }); }
  } else if (a.type === 'validation') { if (now - (state.sent[key] || 0) > 6 * 3600e3) due.push({ key, subject: `Anomaly: ${a.network}`, body: `${a.detail}\nrejected value: ${a.value}` }); }
  else if (a.type === 'manual_stale' || a.type === 'unmapped_network_names') { if (now - (state.sent[key] || 0) > 24 * 3600e3) due.push({ key, subject: a.type === 'manual_stale' ? `Manual fee row needs checking: ${a.exchange}` : 'Unmapped exchange network names', body: a.detail }); }
  else if (a.type === 'no_key') { /* expected until the keys are in; logged only */ }
}
for (const k of Object.keys(state.failing)) if (!failingNow.has(k)) delete state.failing[k];   // recovered
fs.mkdirSync('data/logs', { recursive: true });
fs.appendFileSync('data/logs/alerts.log', `${new Date().toISOString()} alerts=${alerts.length} due=${due.length}${due.length ? ' ' + due.map((d) => d.key).join(',') : ''}\n`);
if (due.length) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL, ALERT_FROM } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS && ALERT_EMAIL) {
    const tr = nodemailer.createTransport({ host: SMTP_HOST, port: +(SMTP_PORT || 587), secure: +(SMTP_PORT || 587) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await tr.sendMail({ from: ALERT_FROM || SMTP_USER, to: ALERT_EMAIL, subject: `[GulfCrypto] ${due.length === 1 ? due[0].subject : due.length + ' alerts'}`, text: due.map((d) => `${d.subject}\n${d.body}`).join('\n\n') + '\n\nhttps://crypto.gulfarcade.com/en/' });
    for (const d of due) state.sent[d.key] = now;
    console.log(`alert email sent: ${due.map((d) => d.subject).join('; ')}`);
  } else console.log(`alerts due but no SMTP settings (logged only): ${due.map((d) => d.subject).join('; ')}`);
} else console.log(`alerts: ${alerts.length} recorded, none due`);
fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
