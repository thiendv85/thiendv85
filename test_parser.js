
// Mock simple version of the parser logic for verification
function detectDelimiter(text) {
    const firstLine = text.split('\n')[0] || '';
    if (firstLine.includes(';') && !firstLine.includes(',')) return ';';
    return ',';
}

function parseLine(line, delimiter) {
    const row = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') { inQuote = !inQuote; }
        else if (char === delimiter && !inQuote) { row.push(current); current = ''; }
        else { current += char; }
    }
    row.push(current);
    return row;
}

function parseNum(val) {
    if (!val) return 0;
    const num = parseFloat(val.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

const mockCsv = `ItemCode,ItemName,M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12
SKU001,Test Item,1,2,3,4,5,6,7,8,9,10,11,12`;

const lines = mockCsv.split('\n').filter(l => l.trim());
const delimiter = detectDelimiter(mockCsv);
const headers = parseLine(lines[0], delimiter).map(h => h.trim().replace(/"/g, ''));
const row = parseLine(lines[1], delimiter);

const salesHistory = [];
// Current logic in csvParser.ts:
for (let i = 12; i >= 1; i--) {
    const mIdx = headers.findIndex(h => {
        const nh = h.toUpperCase().replace(/\s/g, '');
        return nh === `M${i}` || nh === `MONTH${i}`;
    });
    salesHistory.push(mIdx > -1 ? parseNum(row[mIdx]) : 0);
}

console.log("Headers:", JSON.stringify(headers));
console.log("SalesHistory (M12 -> M1):", JSON.stringify(salesHistory));

const expected = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const match = JSON.stringify(salesHistory) === JSON.stringify(expected);

console.log("Match Expected Order:", match);

// Test strict matching for M1 vs M10
const mockCsv2 = `ItemCode,M10,M1
SKU002,100,10`;
const headers2 = parseLine(mockCsv2.split('\n')[0], delimiter).map(h => h.trim().replace(/"/g, ''));
const row2 = parseLine(mockCsv2.split('\n')[1], delimiter);

const m1Idx = headers2.findIndex(h => {
    const nh = h.toUpperCase().replace(/\s/g, '');
    return nh === `M1` || nh === `MONTH1`;
});
console.log("M1 Value (should be 10):", row2[m1Idx]);

if (!match || row2[m1Idx] !== '10') {
    console.error("Verification FAILED");
    process.exit(1);
} else {
    console.log("Verification PASSED");
}
