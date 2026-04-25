import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SCAN_DIRS = ['pages', 'components'];
const STATE_SETTERS = [
    'setIsSubmitting',
    'setIsLoading',
    'setIsProcessing',
    'setIsDeleting',
    'setIsCreating',
    'setIsChangingPw',
    'setIsResetting'
];

let totalUnsafe = 0;

function auditFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let unsafeInFile = 0;

    STATE_SETTERS.forEach(setter => {
        const setterCall = `${setter}(true)`;
        const resetCall = `${setter}(false)`;
        const resetCallNull = `${setter}(null)`;

        let pos = 0;
        while ((pos = content.indexOf(setterCall, pos)) !== -1) {
            // Find a generous window after the setter call (up to 2000 chars)
            const windowEnd = Math.min(content.length, pos + 2000);
            const windowContent = content.substring(pos, windowEnd);

            const hasFinally = windowContent.includes('finally');
            const hasReset = windowContent.includes(resetCall) || windowContent.includes(resetCallNull);

            // Also check if it's in a .finally() promise chain
            const isPromiseChain = windowContent.includes('.finally(');

            if (!(hasFinally && hasReset) && !isPromiseChain) {
                 // Double check: if it resets later in the window without finally, it's still "unsafe"
                 // but we only flag if there's an 'await' and 'setIsSubmitting(true)' without a catch/finally reset
                 if (windowContent.includes('await')) {
                     unsafeInFile++;
                 }
            }
            pos += setterCall.length;
        }
    });

    if (unsafeInFile > 0) {
        console.log(`[UNSAFE] ${path.relative(ROOT, filePath)}: ${unsafeInFile} potential issues`);
    }
    return unsafeInFile;
}

function findBlockEnd(content, startPos) {
    // Simple bracket counting to find the end of the current function or block
    let depth = 0;
    let foundStart = false;
    for (let i = startPos; i < content.length; i++) {
        if (content[i] === '{') { depth++; foundStart = true; }
        else if (content[i] === '}') {
            depth--;
            if (foundStart && depth <= 0) return i + 1;
        }
    }
    return content.length;
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            totalUnsafe += auditFile(fullPath);
        }
    });
}

console.log("--- Starting Async Handler Safety Audit ---");
SCAN_DIRS.forEach(d => {
    const dirPath = path.join(ROOT, d);
    if (fs.existsSync(dirPath)) walk(dirPath);
});

console.log(`\nMetric Result: Unsafe: ${totalUnsafe}`);
process.exit(0);
