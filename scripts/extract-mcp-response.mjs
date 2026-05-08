/**
 * Extract SQL result rows from a Supabase MCP response file.
 * File format (2-layer):
 *   [{"type":"text","text":"{\"result\":\"...<untrusted-data-X>...JSON-array...</untrusted-data-X>\"}"}]
 * Usage: node scripts/extract-mcp-response.mjs <input.txt> <output.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
    console.error('Usage: extract-mcp-response.mjs <input.txt> <output.json>');
    process.exit(1);
}

const raw = readFileSync(inputPath, 'utf8');
const outerEnv = JSON.parse(raw);                    // [{type, text}]
const innerJson = JSON.parse(outerEnv[0].text);      // { result: "..." }
const wrapped = innerJson.result;
// First mention of <untrusted-data-X> is in the prose ("...within the below <untrusted-data-X> boundaries").
// The actual data lives between a SECOND <untrusted-data-X> (followed by `[`) and </untrusted-data-X>.
// Constrain the captured group to start with `[`.
const m = wrapped.match(/<untrusted-data-[^>]+>\s*(\[[\s\S]+?\])\s*<\/untrusted-data-/);
if (!m) {
    console.error('Could not find untrusted-data block.');
    process.exit(1);
}
const arr = JSON.parse(m[1].trim());
console.log(`Extracted ${arr.length} rows`);
writeFileSync(outputPath, JSON.stringify(arr));
console.log(`Wrote ${outputPath}`);
