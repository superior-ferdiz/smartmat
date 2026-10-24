// Fails if a raster image is tracked or about to be added outside docs/evidence/screenshots/.
// Real receipts (phase 8) must never reach Git; screenshots of the app are the only images we keep.
import { execFileSync } from 'node:child_process';

const IMAGE = /\.(jpe?g|png|webp|heic|heif|gif|tiff?|bmp)$/i;
const ALLOWED = /^docs\/evidence\/screenshots\/fase-\d+\//;

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
const files = [...git('ls-files'), ...git('ls-files', '--others', '--exclude-standard')];
const bad = files.filter((f) => IMAGE.test(f) && !ALLOWED.test(f));

if (bad.length > 0) {
  console.error(
    'Image files outside docs/evidence/screenshots/ (real receipts must never be committed):',
  );
  for (const f of bad) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check:files: ${files.length} files, no stray images`);
