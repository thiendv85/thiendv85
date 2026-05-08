#!/usr/bin/env node
// Measures initial-load bundle size after `vite build`.
// "Initial-load" = files referenced from dist/index.html via <script src> or <link href>.
//
// Usage:  node scripts/measure-bundle.mjs [--label "after-step-1"]
// Output: appends one TSV row to results.tsv:
//   <iso-timestamp>\t<label>\t<initial_kb>\t<initial_kb_gzip>\t<total_kb>\t<total_kb_gzip>

import { readFile, readdir, stat, appendFile, access } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const ASSETS = join(DIST, 'assets');
const RESULTS = join(ROOT, 'results.tsv');

const labelArgIdx = process.argv.indexOf('--label');
const label = labelArgIdx > -1 ? process.argv[labelArgIdx + 1] : 'unlabeled';

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(DIST))) {
    console.error('dist/ not found — run `npm run build` first.');
    process.exit(1);
  }
  const html = await readFile(join(DIST, 'index.html'), 'utf8');

  const referenced = new Set();
  // Extract any /assets/... path referenced from the HTML (script src, link href, modulepreload).
  for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)) {
    referenced.add(match[1]);
  }

  const allAssets = (await exists(ASSETS)) ? await readdir(ASSETS) : [];
  let initialRaw = 0;
  let initialGz = 0;
  let totalRaw = 0;
  let totalGz = 0;

  for (const name of allAssets) {
    if (!/\.(js|css)$/.test(name)) continue;
    const buf = await readFile(join(ASSETS, name));
    const gz = gzipSync(buf, { level: 9 }).length;
    totalRaw += buf.length;
    totalGz += gz;
    if (referenced.has(`assets/${name}`)) {
      initialRaw += buf.length;
      initialGz += gz;
    }
  }

  const kb = (n) => (n / 1024).toFixed(1);
  const ts = new Date().toISOString();
  const row = `${ts}\t${label}\t${kb(initialRaw)}\t${kb(initialGz)}\t${kb(totalRaw)}\t${kb(totalGz)}\n`;

  // Pretty console summary
  console.log(`label:       ${label}`);
  console.log(`initial JS+CSS  raw:  ${kb(initialRaw)} KB`);
  console.log(`initial JS+CSS  gzip: ${kb(initialGz)} KB`);
  console.log(`all  JS+CSS    raw:  ${kb(totalRaw)} KB`);
  console.log(`all  JS+CSS    gzip: ${kb(totalGz)} KB`);
  console.log(`referenced from index.html: ${[...referenced].sort().join(', ')}`);

  // Append to TSV
  const headerNeeded = !(await exists(RESULTS));
  if (headerNeeded) {
    await appendFile(RESULTS, 'timestamp\tlabel\tinitial_kb\tinitial_kb_gzip\ttotal_kb\ttotal_kb_gzip\n');
  }
  await appendFile(RESULTS, row);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
