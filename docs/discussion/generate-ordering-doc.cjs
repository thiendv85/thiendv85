const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, PageOrientation, LevelFormat,
        HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
        TabStopType, TabStopPosition } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };

const cell = (text, opts = {}) => new TableCell({
    borders,
    width: { size: opts.width || 1500, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        children: [new TextRun({
            text: String(text),
            bold: opts.bold || false,
            color: opts.color || "000000",
            size: opts.size || 20,
        })],
    })],
});

const headerCell = (text, width) => cell(text, { width, fill: "1F4E78", color: "FFFFFF", bold: true, align: AlignmentType.CENTER, size: 20 });

const p = (text, opts = {}) => new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 120 },
    children: [new TextRun({
        text,
        bold: opts.bold || false,
        italics: opts.italic || false,
        color: opts.color || "000000",
        size: opts.size || 22,
    })],
});

const heading = (text, level) => new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: { before: level === 1 ? 360 : 240, after: 180 },
    children: [new TextRun({ text, bold: true })],
});

const bullet = (text, level = 0) => new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 0, after: 60 },
    children: [new TextRun({ text, size: 22 })],
});

const code = (text) => new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { fill: "F2F2F2", type: ShadingType.CLEAR },
    children: [new TextRun({ text, font: "Consolas", size: 18 })],
});

// Table builders
const algoTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1040, 780, 1040, 1040, 780, 1040, 1100, 1260, 1280],
    rows: [
        new TableRow({
            tableHeader: true,
            children: [
                headerCell("available", 1040),
                headerCell("bo", 780),
                headerCell("onOrder", 1040),
                headerCell("poIn30d", 1040),
                headerCell("rop", 780),
                headerCell("stockMax", 1040),
                headerCell("demand/m", 1100),
                headerCell("→ urgent (Air)", 1260),
                headerCell("→ reserve (Sea)", 1280),
            ],
        }),
        ...[
            [50, 0, 0, 0, 100, 300, 100, "50 (stockout)", 200],
            [50, 80, 100, 100, 100, 300, 100, "0 (PO 30d cứu BO)", 230],
            [50, 80, 100, 0, 100, 300, 100, "130 (BO deficit + buffer)", 100],
            [50, 80, 0, 0, 100, 300, 100, "130 (BO deficit + buffer)", 200],
            [200, 0, 100, 100, 100, 300, 100, "0", "0 (đã đủ)"],
        ].map(row => new TableRow({
            children: row.map((v, i) => cell(v, {
                width: [1040, 780, 1040, 1040, 780, 1040, 1100, 1260, 1280][i],
                align: AlignmentType.CENTER,
                bold: i >= 7,
                color: i === 7 ? "C00000" : i === 8 ? "1F4E78" : "000000",
            })),
        })),
    ],
});

const compareTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2000, 3680, 3680],
    rows: [
        new TableRow({
            tableHeader: true,
            children: [
                headerCell("Khía cạnh", 2000),
                headerCell("Logic CŨ", 3680),
                headerCell("Logic MỚI", 3680),
            ],
        }),
        ...[
            ["Baseline Air", "reserve = available + onOrder (cộng cả PO 3 tháng nữa mới về)", "available - bo (kệ thật trừ nợ thật) + check PO trong 30 ngày"],
            ["Baseline Sea", "reserve = available + onOrder (mix với BO trong target)", "NetDemand + urgentQty (future state, chống double-count)"],
            ["Target", "max(stockMax, bo) — mix khẩn và buffer", "stockMax (chỉ buffer); BO xử lý riêng ở Air"],
            ["Trigger Air", "Hiếm khi fire (gapOrExcess đã cover)", "Rõ ràng: backorder_uncovered hoặc stockout_imminent"],
            ["Cap Air", "4 tháng demand (đắt)", "BO deficit + 1 tháng buffer (tiết kiệm Air)"],
            ["UX", "1 số gợi ý, không rõ tại sao", "2 số riêng + trigger badge + tooltip lý do"],
        ].map(row => new TableRow({
            children: [
                cell(row[0], { width: 2000, bold: true, fill: "F2F2F2" }),
                cell(row[1], { width: 3680, color: "595959" }),
                cell(row[2], { width: 3680, color: "1F4E78", bold: true }),
            ],
        })),
    ],
});

const baselineTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1800, 2700, 2200, 2660],
    rows: [
        new TableRow({
            tableHeader: true,
            children: [
                headerCell("Loại đơn", 1800),
                headerCell("Câu hỏi", 2700),
                headerCell("Baseline đúng", 2200),
                headerCell("Tại sao KHÔNG dùng cái khác", 2660),
            ],
        }),
        new TableRow({
            children: [
                cell("Khẩn (Air)", { width: 1800, bold: true, color: "C00000", fill: "FCE4D6" }),
                cell("Cần đặt nhanh bao nhiêu để không bị hụt?", { width: 2700 }),
                cell("available - bo (kệ hiện tại trừ nợ)", { width: 2200, bold: true }),
                cell("KHÔNG dùng NetDemand vì nó cộng PO 2-3 tháng nữa mới về → false sense of safety", { width: 2660, color: "595959" }),
            ],
        }),
        new TableRow({
            children: [
                cell("Dự trữ (Sea)", { width: 1800, bold: true, color: "1F4E78", fill: "DEEBF7" }),
                cell("Sau khi PO+Air về, còn thiếu bao nhiêu để đạt buffer?", { width: 2700 }),
                cell("NetDemand + urgentQty (future state)", { width: 2200, bold: true }),
                cell("KHÔNG dùng available vì bỏ qua PO sắp về → over-order", { width: 2660, color: "595959" }),
            ],
        }),
    ],
});

const doc = new Document({
    creator: "ATP V16 Team",
    title: "Thuật toán đề xuất đặt hàng — Khẩn vs Dự trữ",
    styles: {
        default: { document: { run: { font: "Calibri", size: 22 } } },
        paragraphStyles: [
            { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
              run: { size: 32, bold: true, color: "1F4E78", font: "Calibri" },
              paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
            { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
              run: { size: 26, bold: true, color: "2E75B6", font: "Calibri" },
              paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
            { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
              run: { size: 24, bold: true, color: "404040", font: "Calibri" },
              paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 } },
        ],
    },
    numbering: {
        config: [
            { reference: "bullets",
              levels: [
                  { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
                    style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
                  { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
                    style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
              ] },
        ],
    },
    sections: [{
        properties: {
            page: {
                size: { width: 12240, height: 15840 },
                margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
            },
        },
        headers: {
            default: new Header({
                children: [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "ATP V16 — Ordering Algorithm Discussion", italics: true, size: 18, color: "808080" })],
                })],
            }),
        },
        footers: {
            default: new Footer({
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: "Trang ", size: 18, color: "808080" }),
                        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" }),
                    ],
                })],
            }),
        },
        children: [
            // ===== TITLE =====
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 600, after: 200 },
                children: [new TextRun({ text: "THUẬT TOÁN ĐỀ XUẤT ĐẶT HÀNG", bold: true, size: 40, color: "1F4E78" })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
                children: [new TextRun({ text: "Khẩn (Air) vs Dự trữ (Sea) — Tài liệu thảo luận", italics: true, size: 24, color: "595959" })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 600 },
                children: [new TextRun({ text: "ATP V16 — Supply Chain Management   |   Version 1.0   |   15/05/2026", size: 18, color: "808080" })],
            }),

            // ===== 1. BACKGROUND =====
            heading("1. Bối cảnh & Vấn đề", 1),
            p("Hệ thống ATP V16 hiện hỗ trợ 2 loại đơn đặt hàng: Đơn Khẩn (Air, vận chuyển hàng không, đắt nhưng nhanh ~1 tuần) và Đơn Dự trữ (Sea, vận chuyển đường biển, rẻ nhưng chậm ~2-3 tháng)."),
            p("Vấn đề: Buyer không biết nên dùng baseline nào để tính số lượng đặt hàng:", { bold: true }),
            bullet("Dùng NetDemand (tồn ròng tương lai = available + onOrder − bo)?"),
            bullet("Dùng stock bình thường (chỉ available — kệ hiện tại)?"),
            bullet("Hay mix cả hai?"),
            p("Tài liệu này phân tích sự khác biệt và đề xuất giải pháp dual-baseline rõ ràng cho từng loại đơn.", { italic: true, color: "595959" }),

            // ===== 2. KEY INSIGHT =====
            heading("2. Insight quan trọng — NetDemand thực chất là gì?", 1),
            p("Trong codebase (utils/csvParser.ts:588), NetDemand được định nghĩa:", { color: "595959" }),
            code("NetDemand = (invNB + invBB + dcNB + dcBB + totalPO) − backorderTotal\n          = (available + onOrder) − bo"),
            p("→ NetDemand thực chất là TỒN RÒNG TƯƠNG LAI (Net Future Supply) sau khi PO về và BO trả hết. Tên gọi misleading vì không phải \"demand\".", { bold: true, color: "C00000" }),
            p("Hệ quả: dùng NetDemand cho đơn Khẩn là sai vì nó đã cộng cả PO 2-3 tháng nữa mới về, tạo cảm giác an toàn giả.", { italic: true }),

            // ===== 3. BASELINE TABLE =====
            heading("3. Bảng quyết định baseline", 1),
            baselineTable,

            // ===== 4. ALGORITHM =====
            new Paragraph({ children: [new PageBreak()] }),
            heading("4. Thuật toán đề xuất", 1),

            heading("Bước 1: Tính poIn30d (PO sắp về trong 30 ngày)", 2),
            code("poIn30d = sum(qty của Pipeline entries có arrival_date ≤ now + 30 ngày)\n\n// Khác với onOrder (= TotalPO):\n//   onOrder = TỔNG tất cả PO (cả PO về sau 3-6 tháng)\n//   poIn30d = chỉ PO sắp về trong 30 ngày → đủ kịp cứu BO"),
            p("Hàm parsePipelineDate đã có sẵn trong inventoryEngine.ts → tận dụng, không cần code mới phức tạp."),

            heading("Bước 2: AIR (Khẩn) — vừa đủ trả BO + 1 tháng buffer", 2),
            code(`effectiveStock30d = available + poIn30d − bo

CASE A — backorder_uncovered (BO không cover nổi sau khi PO 30d về):
  if effectiveStock30d < 0:
    deficit   = -effectiveStock30d
    buffer    = demandMonthly × 1     // cover 1 tháng chờ Sea
    urgentQty = ceil((deficit + buffer) / snp) × snp

CASE B — stockout_imminent (sắp hết, không có PO cứu):
  elif (available − bo) < rop AND poIn30d == 0:
    urgentQty = ceil((rop − (available − bo)) / snp) × snp

CASE C — none:
  else: urgentQty = 0`),

            heading("Bước 3: SEA (Dự trữ) — fill tới StockMax sau khi BO + PO + Air về", 2),
            code(`futureStock = available + onOrder − bo + urgentQty
            = NetDemand + urgentQty       // anti-double-count

if futureStock < stockMax:
  reserveQty = ceil((stockMax − futureStock) / snp) × snp
else:
  reserveQty = 0`),

            // ===== 5. EXAMPLE TABLE =====
            heading("5. Bảng ví dụ minh họa", 1),
            p("(rop = 100, stockMax = 300, demandMonthly = 100, snp = 1)", { italic: true, color: "595959" }),
            algoTable,

            // ===== 6. COMPARISON =====
            new Paragraph({ children: [new PageBreak()] }),
            heading("6. So sánh logic CŨ vs MỚI", 1),
            compareTable,

            // ===== 7. UI CHANGES =====
            heading("7. Thay đổi giao diện", 1),
            heading("7.1 Air button (cột rosé)", 2),
            bullet("Thay 'BO: 130' bằng badge có trigger:"),
            bullet("• Nếu trigger = backorder_uncovered → 'BO+30: 130' (đỏ)", 1),
            bullet("• Nếu trigger = stockout_imminent → 'ROP: 50' (cam)", 1),
            bullet("Tooltip on hover: 'BO 80 > tồn 50, PO 30d = 0 → thiếu 30 + 100 buffer'"),

            heading("7.2 Sea button (cột xanh)", 2),
            bullet("Badge 'MAX: 100' (xanh dương)"),
            bullet("Tooltip: 'Future stock 200 < MAX 300, cần thêm 100'"),

            heading("7.3 Row priority indicator", 2),
            p("Border trái mỗi row theo orderPriority:"),
            bullet("urgent_only  → đỏ (cần xử lý gấp)"),
            bullet("both         → vàng cam (vừa khẩn vừa cần dự trữ)"),
            bullet("reserve_only → xanh (chỉ cần dự trữ)"),
            bullet("none         → trong suốt"),

            heading("7.4 Filter chips (optional)", 2),
            p("Thêm 3 chip lọc nhanh: Chỉ Khẩn / Cả hai / Chỉ Dự trữ — giúp buyer ưu tiên xử lý đơn khẩn trước."),

            // ===== 8. OPEN QUESTIONS =====
            heading("8. Câu hỏi mở để thảo luận với team", 1),
            new Paragraph({
                spacing: { before: 120, after: 120 },
                shading: { fill: "FFF2CC", type: ShadingType.CLEAR },
                children: [new TextRun({ text: "Các quyết định cần team confirm trước khi implement:", bold: true, size: 22 })],
            }),
            bullet("Q1: Buffer 1 tháng cho Air có đủ không, hay nên 2 tuần để rẻ hơn?"),
            bullet("Q2: PO Sea trễ schedule (tới 30 ngày nhưng thực tế chậm) có cần adjust poIn30d không?"),
            bullet("Q3: Có cần tách thêm \"Đơn Critical\" cho SKU P1 không, hoặc Air là đủ?"),
            bullet("Q4: Cap maxOrderMonths = 4 còn phù hợp không, hay nên giảm xuống 3?"),
            bullet("Q5: Có cần thêm cảnh báo khi buyer đặt Air mà có PO sắp về (avoid waste)?"),
            bullet("Q6: Trường hợp SKU P3 (low priority) — có nên tự động skip Air dù có BO?"),

            // ===== 9. NEXT STEPS =====
            heading("9. Next Steps", 1),
            bullet("Team review tài liệu này, comment trực tiếp vào docx"),
            bullet("Họp 30 phút thống nhất câu trả lời cho 6 câu hỏi mở"),
            bullet("Code: ~3 ngày work (chi tiết trong implementation plan)"),
            bullet("Deploy staging → A/B test 1 tuần với 2 buyer"),
            bullet("Rollout production sau khi confirm KPI: % BO covered, % Air cost saving"),

            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 600 },
                children: [new TextRun({ text: "— END OF DISCUSSION DOC —", italics: true, color: "808080", size: 20 })],
            }),
        ],
    }],
});

Packer.toBuffer(doc).then(buffer => {
    const out = "D:/App/V16/docs/discussion/2026-05-15-thuat-toan-dat-hang.docx";
    fs.writeFileSync(out, buffer);
    console.log("Saved:", out);
});
