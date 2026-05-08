#!/usr/bin/env node
// One-shot migration: replace <i className="fa..." /> with <FaIcon className="fa..." />
// across the V16 codebase. Safe to re-run (idempotent because second run finds no <i ...>).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['App.tsx', 'components', 'pages', 'hooks', 'utils'];
const ICON_MODULE_PATH = join(ROOT, 'components', 'Icon.tsx');

const PAIR_RE = /<i(\s[^>]*?)>\s*<\/i>/g;          // <i ...></i>
const SELF_RE = /<i(\s[^>]*?)\/\s*>/g;             // <i ... />

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const s = statSync(full);
        if (s.isDirectory()) {
            if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
            yield* walk(full);
        } else if (/\.(tsx|ts|jsx|js)$/.test(entry)) {
            yield full;
        }
    }
}

function relativeImport(fromFile) {
    let dir = dirname(fromFile);
    let rel = relative(dir, ICON_MODULE_PATH).replace(/\\/g, '/').replace(/\.tsx$/, '');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}

function ensureImport(content, fromFile) {
    if (/from\s+['"][^'"]*\/components\/Icon['"]/.test(content)) return content;
    if (/import\s+\{[^}]*FaIcon[^}]*\}/.test(content)) return content;
    const importPath = relativeImport(fromFile);
    const importLine = `import { FaIcon } from '${importPath}';\n`;
    // Insert after the last existing import.
    const importBlock = content.match(/^(?:import\s.+?(?:;|$)\s*)+/ms);
    if (importBlock) {
        const end = importBlock.index + importBlock[0].length;
        return content.slice(0, end) + importLine + content.slice(end);
    }
    return importLine + content;
}

let totalFiles = 0;
let totalReplacements = 0;
const changedFiles = [];

const targets = [];
for (const target of SCAN_DIRS) {
    const full = join(ROOT, target);
    try {
        const s = statSync(full);
        if (s.isDirectory()) {
            for (const file of walk(full)) targets.push(file);
        } else {
            targets.push(full);
        }
    } catch {
        // missing dir, skip
    }
}

for (const file of targets) {
    if (file.endsWith('Icon.tsx')) continue;          // never rewrite Icon.tsx itself
    const original = readFileSync(file, 'utf8');
    if (!original.includes('<i ')) continue;
    if (!/fa[srlb]?\s+fa-|className=\{?[`"][^`"]*fa-/.test(original)) continue;

    let updated = original;
    let count = 0;
    updated = updated.replace(PAIR_RE, (_m, attrs) => {
        count++;
        return `<FaIcon${attrs} />`;
    });
    updated = updated.replace(SELF_RE, (_m, attrs) => {
        count++;
        return `<FaIcon${attrs} />`;
    });

    if (count === 0) continue;

    updated = ensureImport(updated, file);
    writeFileSync(file, updated);
    totalFiles++;
    totalReplacements += count;
    changedFiles.push(`  ${relative(ROOT, file).split(sep).join('/')}: ${count} replacements`);
}

console.log(`Migrated ${totalReplacements} <i> tags across ${totalFiles} files:`);
for (const line of changedFiles) console.log(line);
