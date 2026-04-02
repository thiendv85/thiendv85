/**
 * Utility for generating the printable Order Form HTML.
 * Tện ích tạo HTML biểu mẫu in Đơn hàng.
 */

import { ApprovalRequest } from '../types/inventory';

export const generateOrderPrintHtml = (
    request: ApprovalRequest,
    rows: any[],
    localQtys: Record<string, { air: number; sea: number }>,
    selectedItems: Set<string>
): string => {
    const sd = new Date(request.submitted_at || Date.now());
    const month = sd.getMonth() + 1;
    const year = sd.getFullYear();
    const weekOfMonth = Math.ceil(sd.getDate() / 7);
    const pad = (n: number) => n.toString().padStart(2, '0');

    const fmt = (v: number, dec = 0) => v ? v.toLocaleString('vi-VN', { maximumFractionDigits: dec }) : '-';
    const fmtMoney = (v: number) => v ? (v / 1_000_000).toFixed(1) : '-';

    // Build data rows
    let totalQty = 0, totalBB = 0, totalNB = 0, totalValue = 0;
    let bodyRows = '';
    rows.forEach((ctx, idx) => {
        const q = localQtys[ctx.itemCode] || { air: 0, sea: 0 };
        const isSelected = selectedItems.has(ctx.itemCode);
        const qtyBB = isSelected ? q.sea : 0; // sea = BB = Miền Bắc
        const qtyNB = isSelected ? q.air : 0; // air = NB = Miền Nam
        const qty = qtyBB + qtyNB;
        const value = (ctx.unitCost || 0) * qty;
        const totalStock = (ctx.available || 0) + (ctx.dealerInventory || 0);
        const fc = ctx.baseForecast || 0;
        const ltMonths = (ctx as any).effectiveLT ? ((ctx as any).effectiveLT / 30).toFixed(1) : '-';
        const mosSauDat = fc > 0 ? ((totalStock + (ctx.totalPO || 0) + qty) / fc).toFixed(1) : '-';

        totalQty += qty; totalBB += qtyBB; totalNB += qtyNB; totalValue += value;

        bodyRows += `<tr>
            <td class="c">${idx + 1}</td>
            <td>${ctx.itemCode}</td>
            <td class="name">${ctx.itemName}</td>
            <td class="c">${ctx.loisGroup || '-'}</td>
            <td>${ctx.typecar || '-'}</td>
            <td class="c">${ctx.loisGroup || '-'}</td>
            <td class="c">${ltMonths}</td>
            <td class="r">${fmt(ctx.available)}</td>
            <td class="r">${fmt(ctx.dealerInventory)}</td>
            <td class="r">${fmt(totalStock)}</td>
            <td class="r">${fmt(fc, 1)}</td>
            <td class="r">${ctx.mos ? ctx.mos.toFixed(1) : '-'}</td>
            <td class="r">${fmt(ctx.totalPO)}</td>
            <td class="r">${fmt(ctx.backorder)}</td>
            <td class="r">${fmt(ctx.stockMax)}</td>
            <td class="r b">${fmt(qty)}</td>
            <td class="r">${fmt(qtyBB)}</td>
            <td class="r">${fmt(qtyNB)}</td>
            <td class="r">${fmtMoney(value)}</td>
            <td class="r">${mosSauDat}</td>
            <td class="c"></td>
        </tr>`;
    });

    const footerRow = `<tr>
        <td colspan="7" class="b">TỔNG CỘNG</td>
        <td class="r"></td><td class="r"></td><td class="r"></td><td class="r"></td><td class="r"></td>
        <td class="r"></td><td class="r"></td><td class="r"></td>
        <td class="r b">${fmt(totalQty)}</td>
        <td class="r">${fmt(totalBB)}</td>
        <td class="r">${fmt(totalNB)}</td>
        <td class="r b">${fmtMoney(totalValue)}</td>
        <td class="r"></td><td class="c"></td>
    </tr>`;

    return `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8">
<title>Phiếu Đặt Hàng – ${request.draft_name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,600;0,700;0,900;1,400&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 8mm 7mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Noto Sans', Arial, sans-serif; font-size: 7pt; color: #000; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.title { text-align: center; font-size: 10pt; font-weight: 900; color: #c00; text-transform: uppercase; line-height: 1.5; margin-top: 6px; }
.subtitle { text-align: center; font-size: 8pt; font-style: italic; color: #c00; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 6.5pt; table-layout: fixed; }
thead th { background: #e8e8e8; border: 1px solid #999; padding: 2px 3px; font-size: 6pt; font-weight: 700; text-align: center; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
tbody td { border: 1px solid #bbb; padding: 1.5px 3px; vertical-align: middle; font-size: 6.5pt; line-height: 1.2; }
tfoot td { background: #f0f0f0; font-weight: 900; border: 1px solid #999; padding: 2px 3px; font-size: 6.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.r { text-align: right; } .c { text-align: center; } .b { font-weight: 900; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
.hdr-group { background: #ddd; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print { body { margin: 0; } }
</style>
</head><body>
<div class="title">BẢNG KÊ DANH MỤC PHỤ TÙNG, VẬT TƯ THƯƠNG HIỆU<br/>ĐỀ XUẤT ĐẶT HÀNG TUẦN ${weekOfMonth} THÁNG ${pad(month)} NĂM ${year}</div>
<div class="subtitle">(Đính kèm theo tờ trình số:&hellip;/&hellip;/ Ngày &hellip;&hellip; tháng ${pad(month)} năm ${year})</div>
<table>
<colgroup>
<col style="width:22px"><col style="width:62px"><col style="width:110px"><col style="width:32px"><col style="width:48px">
<col style="width:26px"><col style="width:30px">
<col style="width:32px"><col style="width:32px"><col style="width:36px">
<col style="width:34px"><col style="width:30px"><col style="width:34px"><col style="width:30px"><col style="width:34px">
<col style="width:32px"><col style="width:32px"><col style="width:32px"><col style="width:40px">
<col style="width:34px"><col style="width:34px">
</colgroup>
<thead>
<tr>
<th rowspan="2">STT</th>
<th rowspan="2">Mã Phụ Tùng</th>
<th rowspan="2">Tên Phụ Tùng</th>
<th rowspan="2">Nhóm loại hình</th>
<th rowspan="2">Mẫu xe</th>
<th rowspan="2">LOIS</th>
<th rowspan="2">Thời gian hàng về<br/>(Tháng)</th>
<th colspan="3" class="hdr-group">Tồn Việt Nam</th>
<th rowspan="2">BQ bán hàng GT</th>
<th rowspan="2">Cơ số tồn Việt Nam<br/>(Tháng BH)</th>
<th rowspan="2">Đặt NCC chưa giao</th>
<th rowspan="2">Số lượng nợ</th>
<th rowspan="2">Số lượng tồn kho<br/>định mức</th>
<th colspan="4" class="hdr-group">Đề xuất đặt hàng dự trữ tuần ${pad(weekOfMonth)} tháng ${pad(month)}, năm ${year}</th>
<th rowspan="2">Tổng Cơ số tồn sau đặt<br/>(tháng BH)</th>
<th rowspan="2">Cơ số tồn định mức<br/>đã duyệt</th>
</tr>
<tr>
<th>PP</th><th>ĐL</th><th>Tổng tồn</th>
<th>Tổng số</th><th>Miền Bắc</th><th>Miền Nam</th><th>Thành tiền<br/>(Tr. đ)</th>
</tr>
</thead>
<tbody>${bodyRows}</tbody>
<tfoot>${footerRow}</tfoot>
</table>
</body></html>`;
};

export const printOrder = (html: string) => {
    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) {
        alert('Trình duyệt đã chặn popup. Hãy cho phép popup để in.');
        return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 600);
};
