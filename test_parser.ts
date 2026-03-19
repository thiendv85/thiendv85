
import { parseCSV } from './utils/csvParser';

const mockCsv = `ItemCode,ItemName,M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12
SKU001,Test Item,1,2,3,4,5,6,7,8,9,10,11,12`;

const data = parseCSV(mockCsv);
const item = data[0];

console.log("ItemCode:", item.ItemCode);
console.log("SalesHistory:", JSON.stringify(item.SalesHistory));

// Expected: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
// Oldest (M12) to Newest (M1)
const expected = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const match = JSON.stringify(item.SalesHistory) === JSON.stringify(expected);

console.log("Match Expected Order (M12 -> M1):", match);

if (!match) {
    process.exit(1);
}
