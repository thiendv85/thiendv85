// Chạy 1 lần: npx tsx scripts/import-execution-history.mjs "<đường dẫn .xlsx>"
// Cần env: SUPABASE_URL, SUPABASE_SERVICE_KEY
// LƯU Ý: ghi vào Supabase LIVE — chỉ chạy thủ công, có chủ đích. Idempotent (upsert natural key).
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { mapExcelRowToCanonical, groupCanonicalRows } from '../utils/execution/importMap.ts';

const FILE = process.argv[2];
if (!FILE) {
  console.error('Thiếu đường dẫn file. Dùng: npx tsx scripts/import-execution-history.mjs "<file.xlsx>"');
  process.exit(2);
}

const HEADER_INDEX = {
  po_no: 1, po_date: 2, region: 3, order_type: 4, ship_method: 5, part_old: 6, part_new: 7,
  name_vi: 8, name_en: 9, unit: 10, qty: 11, unit_price: 12, car: 14, supplier: 15,
  ordered_at: 16, ext_ref: 17, confirmed_at: 18, invoice_no: 19, invoice_date: 20,
  etd: 21, eta: 22, port: 23, expected_wh: 24, actual_wh: 25, warehouse: 26, status: 27, group: 29,
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 1) Đọc + map từng dòng
const mapped = [];
const wb = new ExcelJS.stream.xlsx.WorkbookReader(FILE, {});
let rowNum = 0;
for await (const worksheet of wb) {
  for await (const row of worksheet) {
    rowNum++;
    if (rowNum === 1) continue; // header
    const values = row.values; // exceljs: index 1-based
    const arr = [];
    for (let i = 0; i < values.length; i++) arr[i] = values[i];
    mapped.push(mapExcelRowToCanonical(arr, HEADER_INDEX));
  }
}

// 2) Gom thành cây order→lines→lots (hàm thuần đã test, gộp qty + đếm skip)
const { orders, skippedNoPo, skippedNoSupplier, skippedNoPart } = groupCanonicalRows(mapped);
console.log(`Đọc ${rowNum - 1} dòng → ${orders.size} đơn NCC`);
console.log(`Bỏ qua: ${skippedNoPo} thiếu PO, ${skippedNoSupplier} thiếu NCC, ${skippedNoPart} thiếu mã PT`);

// 3) Ghi idempotent + fail-loud
let nOrders = 0, nLines = 0, nLots = 0;
const failures = [];
for (const { order, lines } of orders.values()) {
  const { data: so, error: e1 } = await supabase
    .from('supplier_orders')
    .upsert(order, { onConflict: 'po_region_no,supplier' })
    .select('id')
    .single();
  if (e1 || !so) {
    failures.push({ level: 'order', key: `${order.po_region_no}|${order.supplier}`, error: e1?.message || 'no id' });
    continue;
  }
  nOrders++;
  for (const { line, lots } of lines.values()) {
    const { data: ol, error: e2 } = await supabase
      .from('order_lines')
      .upsert({ ...line, supplier_order_id: so.id }, { onConflict: 'supplier_order_id,part_code' })
      .select('id')
      .single();
    if (e2 || !ol) {
      failures.push({ level: 'line', key: `${so.id}/${line.part_code}`, error: e2?.message || 'no id' });
      continue;
    }
    nLines++;
    const lotRows = lots.map((l) => ({ ...l, order_line_id: ol.id }));
    const { error: e3 } = await supabase.from('receipt_lots').upsert(lotRows, { onConflict: 'order_line_id,invoice_no' });
    if (e3) failures.push({ level: 'lot', key: ol.id, error: e3.message });
    else nLots += lotRows.length;
  }
}

const byLevel = (lv) => failures.filter((f) => f.level === lv).length;
await supabase.from('import_log').insert({
  supplier: 'HISTORICAL',
  filename: FILE,
  rows_total: rowNum - 1,
  rows_matched: 0,
  rows_new: nLines,
  rows_unmatched: skippedNoPo + skippedNoSupplier + skippedNoPart,
  note: `orders=${nOrders} lines=${nLines} lots=${nLots} | skipped: po=${skippedNoPo} ncc=${skippedNoSupplier} part=${skippedNoPart} | failed: order=${byLevel('order')} line=${byLevel('line')} lot=${byLevel('lot')}`,
});
console.log(`Đã ghi: ${nOrders} đơn, ${nLines} dòng, ${nLots} lô`);
if (failures.length) {
  console.error(`THẤT BẠI ${failures.length}: order=${byLevel('order')} line=${byLevel('line')} lot=${byLevel('lot')}`);
  failures.slice(0, 20).forEach((f) => console.error(`  [${f.level}] ${f.key}: ${f.error}`));
  process.exit(1);
}
