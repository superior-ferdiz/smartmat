// Phase 14: requirement → test traceability, printed as a Markdown table.
// Reads the requirement IDs from docs/development/requirements/00-kravoversikt.md and finds every tracked test file
// that names them (also "FR-HH-003/005" and "FR-NOTIF-001–004"). It counts files, not assertions: a file that names
// an ID shows that someone meant to test it, not that the test is good. Usage: node scripts/traceability.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const OVERVIEW = 'docs/development/requirements/00-kravoversikt.md';
const ID = /\b((?:FR|NFR)-[A-Z]+)-(\d{3})((?:[/–-]\d{3})*)/g;

const kind = (file) =>
  file.startsWith('e2e/') ? 'e2e' : file.startsWith('apps/api/test/') ? 'api' : 'unit';

/** "FR-HH-003/005" → FR-HH-003, FR-HH-005; "FR-NOTIF-001–004" → 001, 002, 003, 004. */
function expand(prefix, first, rest) {
  const ids = [Number(first)];
  for (const [, sep, num] of rest.matchAll(/([/–-])(\d{3})/g)) {
    const n = Number(num);
    if (sep === '/') ids.push(n);
    else for (let i = ids[ids.length - 1] + 1; i <= n; i++) ids.push(i);
  }
  return ids.map((n) => `${prefix}-${String(n).padStart(3, '0')}`);
}

const requirements = [];
for (const line of readFileSync(OVERVIEW, 'utf8').split('\n')) {
  const m = /^\| ((?:FR|NFR)-[A-Z]+-\d{3}) \| (.+?) \|/.exec(line);
  if (m) requirements.push({ id: m[1], text: m[2] });
}

const testFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.test\.tsx?$/.test(f) || /^e2e\/.*\.spec\.ts$/.test(f));

const found = new Map(requirements.map((r) => [r.id, { unit: [], api: [], e2e: [] }]));
for (const file of testFiles) {
  const seen = new Set();
  for (const [, prefix, first, rest] of readFileSync(file, 'utf8').matchAll(ID)) {
    for (const id of expand(prefix, first, rest)) seen.add(id);
  }
  for (const id of seen) found.get(id)?.[kind(file)].push(file);
}

const cell = (files) => (files.length === 0 ? '–' : String(files.length));
console.log('| Krav | Enhet | API | E2E | Testfiler |');
console.log('|---|---|---|---|---|');
let untested = 0;
for (const { id } of requirements) {
  const f = found.get(id);
  const all = [...f.unit, ...f.api, ...f.e2e];
  if (all.length === 0) untested++;
  const names =
    all.map((p) => `\`${p.split('/').pop()}\``).join(', ') || '**ingen test nevner kravet**';
  console.log(`| ${id} | ${cell(f.unit)} | ${cell(f.api)} | ${cell(f.e2e)} | ${names} |`);
}
console.log(
  `\n${requirements.length} krav, ${testFiles.length} testfiler, ${untested} krav uten en testfil som nevner dem.`,
);
