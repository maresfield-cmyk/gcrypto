// Export every user-facing string with its context note for the translators: docs/strings-for-translation.csv
import fs from 'node:fs';
const en = JSON.parse(fs.readFileSync('locales/en.json')), notes = JSON.parse(fs.readFileSync('locales/notes.json'));
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const rows = Object.entries(en).map(([k, v]) => [k, v, notes[k] || '', ''].map(q).join(','));
fs.writeFileSync('docs/strings-for-translation.csv', 'key,english,context,arabic\n' + rows.join('\n') + '\n');
console.log(`${rows.length} strings -> docs/strings-for-translation.csv`);
