const fs = require("fs");
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
    BorderStyle, WidthType, ShadingType, PageNumber, PageBreak, TabStopType, TabStopPosition
} = require("docx");

// ── Colors ──
const PRIMARY = "1B4F72";
const PRIMARY_LIGHT = "D6EAF8";
const ACCENT = "E74C3C";
const GRAY = "7F8C8D";
const GRAY_LIGHT = "F2F3F4";
const CODE_BG = "F8F9FA";
const BORDER_COLOR = "BDC3C7";
const WHITE = "FFFFFF";

const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const cellMargins = { top: 60, bottom: 60, left: 120, right: 120 };

// ── Helpers ──
function heading1(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        children: [new TextRun({ text, bold: true, size: 32, font: "Arial", color: PRIMARY })],
    });
}
function heading2(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        children: [new TextRun({ text, bold: true, size: 26, font: "Arial", color: PRIMARY })],
    });
}
function heading3(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text, bold: true, size: 22, font: "Arial", color: "2C3E50" })],
    });
}
function para(runs, opts = {}) {
    const children = typeof runs === "string"
        ? [new TextRun({ text: runs, size: 21, font: "Arial" })]
        : runs;
    return new Paragraph({ spacing: { after: 120 }, ...opts, children });
}
function bold(text) { return new TextRun({ text, bold: true, size: 21, font: "Arial" }); }
function normal(text) { return new TextRun({ text, size: 21, font: "Arial" }); }
function italic(text) { return new TextRun({ text, italics: true, size: 21, font: "Arial", color: GRAY }); }
function code(text) { return new TextRun({ text, size: 19, font: "Consolas", color: ACCENT }); }

function codeBlock(lines) {
    return lines.map(line => new Paragraph({
        spacing: { after: 0 },
        shading: { fill: CODE_BG, type: ShadingType.CLEAR },
        indent: { left: 360 },
        children: [new TextRun({ text: line || " ", size: 17, font: "Consolas", color: "2C3E50" })],
    }));
}

function bulletItem(runs, level = 0) {
    const children = typeof runs === "string"
        ? [new TextRun({ text: runs, size: 21, font: "Arial" })]
        : runs;
    return new Paragraph({
        numbering: { reference: "bullets", level },
        spacing: { after: 60 },
        children,
    });
}

function numberItem(runs, level = 0) {
    const children = typeof runs === "string"
        ? [new TextRun({ text: runs, size: 21, font: "Arial" })]
        : runs;
    return new Paragraph({
        numbering: { reference: "numbers", level },
        spacing: { after: 60 },
        children,
    });
}

function makeHeaderRow(cells) {
    return new TableRow({
        tableHeader: true,
        children: cells.map((text, i) => new TableCell({
            borders,
            shading: { fill: PRIMARY, type: ShadingType.CLEAR },
            margins: cellMargins,
            width: { size: cells._widths ? cells._widths[i] : Math.floor(9360 / cells.length), type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 19, font: "Arial", color: WHITE })] })],
        })),
    });
}

function makeRow(cells, shaded = false) {
    return new TableRow({
        children: cells.map((text, i) => new TableCell({
            borders,
            shading: shaded ? { fill: GRAY_LIGHT, type: ShadingType.CLEAR } : undefined,
            margins: cellMargins,
            width: { size: cells._widths ? cells._widths[i] : Math.floor(9360 / cells.length), type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun({ text, size: 19, font: "Arial" })] })],
        })),
    });
}

function makeTable(headers, rows, widths) {
    headers._widths = widths;
    rows.forEach(r => r._widths = widths);
    return new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: widths,
        rows: [
            makeHeaderRow(headers),
            ...rows.map((r, i) => makeRow(r, i % 2 === 1)),
        ],
    });
}

function spacer() { return new Paragraph({ spacing: { after: 80 }, children: [] }); }
function divider() {
    return new Paragraph({
        spacing: { before: 200, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PRIMARY_LIGHT, space: 1 } },
        children: [],
    });
}

// ── Build Document ──
const doc = new Document({
    styles: {
        default: { document: { run: { font: "Arial", size: 21 } } },
        paragraphStyles: [
            { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
                run: { size: 32, bold: true, font: "Arial", color: PRIMARY },
                paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
            { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
                run: { size: 26, bold: true, font: "Arial", color: PRIMARY },
                paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
            { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
                run: { size: 22, bold: true, font: "Arial", color: "2C3E50" },
                paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
        ],
    },
    numbering: {
        config: [
            {
                reference: "bullets",
                levels: [
                    { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
                        style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
                    { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
                        style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
                ],
            },
            {
                reference: "numbers",
                levels: [
                    { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
                        style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
                    { level: 1, format: LevelFormat.DECIMAL, text: "%2.", alignment: AlignmentType.LEFT,
                        style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
                ],
            },
        ],
    },
    sections: [
        // ═══════════════════════════════════════════════════════════════════════
        // COVER PAGE
        // ═══════════════════════════════════════════════════════════════════════
        {
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
                },
            },
            children: [
                new Paragraph({ spacing: { before: 3000 }, children: [] }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                    children: [new TextRun({ text: "HUONG DAN HE THONG", size: 48, bold: true, font: "Arial", color: PRIMARY })],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                    children: [new TextRun({ text: "PHE DUYET DAT HANG", size: 48, bold: true, font: "Arial", color: PRIMARY })],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                    children: [new TextRun({ text: "Version 2.0", size: 28, font: "Arial", color: GRAY })],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    border: { top: { style: BorderStyle.SINGLE, size: 6, color: PRIMARY, space: 1 } },
                    spacing: { before: 200, after: 200 },
                    children: [],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                    children: [new TextRun({ text: "8 Phase cai tien quy trinh phe duyet", size: 24, font: "Arial", color: GRAY })],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                    children: [new TextRun({ text: "Cap nhat: 24/03/2026", size: 22, font: "Arial", color: GRAY })],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 1500 },
                    children: [new TextRun({ text: "Supabase + React 19 + TypeScript 5.8 + Vercel", size: 20, font: "Arial", color: GRAY })],
                }),
            ],
        },
        // ═══════════════════════════════════════════════════════════════════════
        // TABLE OF CONTENTS + MAIN CONTENT
        // ═══════════════════════════════════════════════════════════════════════
        {
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
                },
            },
            headers: {
                default: new Header({
                    children: [new Paragraph({
                        children: [
                            new TextRun({ text: "He thong Phe duyet Dat hang v2.0", size: 16, font: "Arial", color: GRAY }),
                        ],
                        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                    })],
                }),
            },
            footers: {
                default: new Footer({
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: "Trang ", size: 16, font: "Arial", color: GRAY }),
                            new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Arial", color: GRAY }),
                        ],
                    })],
                }),
            },
            children: [
                // ── TOC ──
                heading1("Muc luc"),
                numberItem("Tong quan kien truc"),
                numberItem("Phase 1: Phan quyen & RBAC"),
                numberItem("Phase 2: Kiem soat chuyen trang thai"),
                numberItem("Phase 3: Ly do Tu choi & Tra lai"),
                numberItem("Phase 4: Phe duyet tuan tu theo cap"),
                numberItem("Phase 5: Optimistic Locking"),
                numberItem("Phase 6: Audit Log nang cao"),
                numberItem("Phase 7: Quy tac kiem tra truoc phe duyet"),
                numberItem("Phase 8: Escalation & Deadline"),
                numberItem("Cau truc file"),
                numberItem("Huong dan quan tri"),
                numberItem("FAQ"),
                new Paragraph({ children: [new PageBreak()] }),

                // ═══════════════════════════════════════════════════════════════
                // 1. TONG QUAN
                // ═══════════════════════════════════════════════════════════════
                heading1("1. Tong quan kien truc"),

                heading2("So do trang thai don hang"),
                ...codeBlock([
                    "                    +------------+",
                    "        +---------->| returned   |<--------------+",
                    "        |           +-----+------+               |",
                    "        |                 | resubmit             |",
                    "        |                 v                      |",
                    "  +-----+------+   +------------+        +------+-------+",
                    "  | unlocked   |<--| pending    |------->| in_progress  |",
                    "  +------------+   +-----+------+        +------+-------+",
                    "        ^                |                       |",
                    "        |                v                       v",
                    "  +-----+------+   +------------+        +------------+",
                    "  | approved   |   | rejected   |        | approved   |",
                    "  +------------+   +------------+        +------------+",
                    "                   (trang thai cuoi)",
                ]),
                spacer(),

                heading2("Vai tro nguoi dung"),
                makeTable(
                    ["Vai tro", "Mo ta", "Quyen"],
                    [
                        ["admin", "Quan tri vien", "Tat ca quyen, duyet moi cap"],
                        ["planner", "Nguoi lap ke hoach", "Tao & gui don dat hang"],
                        ["approver", "Nguoi phe duyet", "Duyet theo cap duoc gan"],
                        ["viewer", "Nguoi xem", "Chi xem, khong thao tac"],
                    ],
                    [2000, 3000, 4360]
                ),
                spacer(),

                heading2("Cong nghe"),
                bulletItem([bold("Frontend: "), normal("React 19 + TypeScript 5.8 + Vite 6.2 + Tailwind CSS")]),
                bulletItem([bold("Backend: "), normal("Supabase (PostgreSQL + Edge Functions)")]),
                bulletItem([bold("Hosting: "), normal("Vercel (production: dvptdl.com)")]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 2. PHASE 1: RBAC
                // ═══════════════════════════════════════════════════════════════
                heading1("2. Phase 1: Phan quyen & RBAC"),

                heading2("Mo ta"),
                para([
                    normal("He thong phan quyen dua tren "),
                    bold("vai tro"),
                    normal(" (role) ket hop "),
                    bold("cap phe duyet"),
                    normal(" (approval_levels). Moi user duoc gan mot mang cap ma ho duoc phep duyet."),
                ]),

                heading2("Cau truc du lieu"),
                ...codeBlock([
                    "-- Bang profiles (da mo rong)",
                    "profiles.approval_levels  INT[]   -- Vi du: [1], [1,2], [1,2,3]",
                    "profiles.department       TEXT    -- Vi du: 'sales', 'procurement'",
                ]),
                spacer(),
                para([bold("Mac dinh khi seed:")]),
                bulletItem([code("admin"), normal(" -> approval_levels = [1, 2, 3] (duyet duoc tat ca cap)")]),
                bulletItem([code("approver"), normal(" -> approval_levels = [1] (chi duyet cap 1)")]),

                heading2("Cach su dung trong code"),
                ...codeBlock([
                    "import { useApprovalAuth } from '../hooks/useApprovalAuth';",
                    "",
                    "function MyComponent() {",
                    "    const {",
                    "        hasApprovalRole,  // true neu la admin hoac approver",
                    "        allowedLevels,    // [1, 2] - cap duoc duyet",
                    "        canApproveLevel,  // (level) => boolean",
                    "        canSubmit,        // true neu la planner hoac admin",
                    "        canUnlock,        // true neu la admin",
                    "        canViewAll,       // true neu la admin",
                    "        department,       // 'sales' | null",
                    "    } = useApprovalAuth();",
                    "",
                    "    if (canApproveLevel(2)) {",
                    "        // Hien nut Phe duyet cho cap 2",
                    "    }",
                    "}",
                ]),

                heading2("AuthGuard Component"),
                para("Boc bat ky component nao can bao ve:"),
                ...codeBlock([
                    "<AuthGuard requiredRoles={['admin', 'approver']} requiredLevel={2}>",
                    "    <SensitiveApprovalContent />",
                    "</AuthGuard>",
                ]),
                spacer(),
                para([italic("Neu user khong du quyen -> hien thong bao \"Access Denied\" thay vi noi dung.")]),

                heading2("Quan tri: Gan cap phe duyet"),
                ...codeBlock([
                    "-- Gan user co the duyet cap 1 va 2",
                    "UPDATE profiles",
                    "SET approval_levels = ARRAY[1, 2]",
                    "WHERE id = 'user-uuid-here';",
                    "",
                    "-- Gan phong ban",
                    "UPDATE profiles",
                    "SET department = 'procurement'",
                    "WHERE id = 'user-uuid-here';",
                ]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 3. PHASE 2: STATE TRANSITION
                // ═══════════════════════════════════════════════════════════════
                heading1("3. Phase 2: Kiem soat chuyen trang thai"),

                heading2("Mo ta"),
                para([
                    normal("Moi thay doi trang thai deu duoc kiem tra "),
                    bold("ca o client lan database"),
                    normal(". Khong the hack de chuyen trang thai bat hop le."),
                ]),

                heading2("Bang chuyen trang thai hop le"),
                makeTable(
                    ["Trang thai hien tai", "Co the chuyen sang"],
                    [
                        ["pending", "in_progress, rejected, returned"],
                        ["in_progress", "in_progress, approved, rejected, returned"],
                        ["approved", "unlocked (trong 24h)"],
                        ["rejected", "Khong the chuyen (trang thai cuoi)"],
                        ["unlocked", "pending (gui lai)"],
                        ["returned", "pending (sua & gui lai)"],
                    ],
                    [3500, 5860]
                ),

                heading2("Quy tac dac biet"),
                numberItem([bold("rejected la trang thai cuoi"), normal(" - don bi tu choi khong the mo lai, phai tao don moi")]),
                numberItem([bold("Mo khoa chi trong 24h"), normal(" - sau khi duyet, chi admin duoc mo khoa trong 24 gio dau")]),
                numberItem([bold("Kiem tra cap phe duyet"), normal(" - chi user co cap tuong ung moi duoc duyet")]),

                heading2("DB Trigger (lop bao ve cuoi)"),
                ...codeBlock([
                    "-- Trigger tu dong kiem tra MOI update tren approval_requests",
                    "CREATE TRIGGER trg_check_status_transition",
                    "BEFORE UPDATE ON approval_requests",
                    "FOR EACH ROW EXECUTE FUNCTION check_status_transition();",
                ]),
                spacer(),
                para([
                    normal("Neu ai do gui request truc tiep qua API de chuyen "),
                    code("rejected -> approved"),
                    normal(" -> "),
                    bold("DB se block"),
                    normal(" voi loi \"Invalid status transition\"."),
                ]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 4. PHASE 3: REJECTION REASON
                // ═══════════════════════════════════════════════════════════════
                heading1("4. Phase 3: Ly do Tu choi & Tra lai"),

                heading2("Mo ta"),
                para([
                    normal("Khi "),
                    bold("tu choi"),
                    normal(" hoac "),
                    bold("tra lai"),
                    normal(" don, nguoi duyet "),
                    bold("bat buoc"),
                    normal(" phai nhap ly do chi tiet (toi thieu 10 ky tu)."),
                ]),

                heading2("Cau truc du lieu"),
                ...codeBlock([
                    "approval_requests.rejection_reason   TEXT  -- Ly do tu choi",
                    "approval_requests.returned_reason    TEXT  -- Ly do tra lai",
                ]),

                heading2("Quy tac nhap ly do"),
                makeTable(
                    ["Hanh dong", "Bat buoc?", "Ky tu toi thieu", "Ky tu toi da"],
                    [
                        ["Phe duyet (approved)", "Khong", "--", "500"],
                        ["Tu choi (rejected)", "Bat buoc", "10", "500"],
                        ["Tra lai (returned)", "Bat buoc", "10", "500"],
                        ["Binh luan (commented)", "Khong", "--", "500"],
                    ],
                    [2500, 1800, 2500, 2560]
                ),

                heading2("UI hanh vi"),
                bulletItem([normal("Khi chon "), bold("Tu choi/Tra lai"), normal(" -> textarea ly do hien ra (rieng biet voi comment chung)")]),
                bulletItem("Nut thao tac bi disable cho den khi nhap du 10 ky tu"),
                bulletItem([normal("Ly do duoc luu trong cot rieng ("), code("rejection_reason"), normal(" / "), code("returned_reason"), normal("), hien thi trong tab lich su")]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 5. PHASE 4: SEQUENTIAL
                // ═══════════════════════════════════════════════════════════════
                heading1("5. Phase 4: Phe duyet tuan tu theo cap"),

                heading2("Mo ta"),
                para([
                    normal("Don hang phai duoc duyet "),
                    bold("tuan tu"),
                    normal(" qua tung cap: Level 1 -> Level 2 -> Level 3. Khong the nhay cap."),
                ]),

                heading2("DB Trigger"),
                ...codeBlock([
                    "-- Ngan nhay cap: level 1 -> level 3 bi block",
                    "CREATE TRIGGER trg_sequential_level",
                    "BEFORE UPDATE ON approval_requests",
                    "WHEN (OLD.current_level IS DISTINCT FROM NEW.current_level)",
                    "EXECUTE FUNCTION enforce_sequential_level();",
                ]),
                spacer(),
                bulletItem("Level 1 -> Level 2: Hop le"),
                bulletItem([normal("Level 1 -> Level 3: "), bold("Loi"), normal(": \"Cannot skip approval levels: 1 -> 3\"")]),

                heading2("Luong phe duyet nhieu cap"),
                numberItem("Planner tao don -> status: pending, level: 1"),
                numberItem("Approver Level 1 duyet -> status: in_progress, level: 2"),
                numberItem("Approver Level 2 duyet -> status: in_progress, level: 3"),
                numberItem("Approver Level 3 duyet -> status: approved (hoan tat)"),

                heading2("Ai duyet duoc gi?"),
                bulletItem([bold("Admin: "), normal("Duyet duoc tat ca cap (khong can gan approval_levels)")]),
                bulletItem([bold("Approver voi approval_levels = [1]: "), normal("Chi duyet cap 1")]),
                bulletItem([bold("Approver voi approval_levels = [1, 2]: "), normal("Duyet duoc cap 1 va 2")]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 6. PHASE 5: OPTIMISTIC LOCKING
                // ═══════════════════════════════════════════════════════════════
                heading1("6. Phase 5: Optimistic Locking"),

                heading2("Mo ta"),
                para([
                    normal("Ngan xung dot khi "),
                    bold("2 nguoi cung thao tac"),
                    normal(" tren 1 don. Moi don co "),
                    code("version"),
                    normal(" tang dan sau moi thay doi."),
                ]),

                heading2("Co che hoat dong"),
                ...codeBlock([
                    "1. User A mo don (version = 3)",
                    "2. User B mo don (version = 3)",
                    "3. User A duyet -> version 3 -> 4  [THANH CONG]",
                    "4. User B duyet -> version 3 -> nhung DB da la 4  [CONFLICT]",
                ]),

                heading2("Xu ly xung dot"),
                para("Khi phat hien conflict:"),
                bulletItem([normal("Hien thong bao: "), bold("\"Don da bi thay doi boi nguoi khac, vui long refresh\"")]),
                bulletItem("User can reload lai trang de lay du lieu moi nhat"),
                bulletItem("Khong co du lieu nao bi mat"),
                spacer(),
                para([bold("Cac ham bi anh huong: "), code("processApprovalAction()"), normal(", "), code("resubmitApprovalRequest()"), normal(", "), code("unlockRequest()")]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 7. PHASE 6: AUDIT LOG
                // ═══════════════════════════════════════════════════════════════
                heading1("7. Phase 6: Audit Log nang cao"),

                heading2("Mo ta"),
                para([
                    normal("Moi hanh dong tren don hang deu duoc ghi log chi tiet trong "),
                    code("approval_actions"),
                    normal(", kem theo metadata JSON."),
                ]),

                heading2("Cau truc metadata"),
                ...codeBlock([
                    "approval_actions.metadata  JSONB DEFAULT '{}'",
                    "",
                    "{",
                    "    \"old_status\": \"pending\",",
                    "    \"new_status\": \"in_progress\",",
                    "    \"old_level\": 1,",
                    "    \"new_level\": 2,",
                    "    \"changed_fields\": [\"status\", \"current_level\"],",
                    "    \"version_before\": 1,",
                    "    \"version_after\": 2,",
                    "    \"reason\": \"Noi dung ly do neu co\"",
                    "}",
                ]),

                heading2("Hien thi trong UI"),
                para([normal("Tab "), bold("Lich su"), normal(" trong OrderReviewModal hien:")]),
                bulletItem("Ai thao tac"),
                bulletItem("Thoi gian"),
                bulletItem("Trang thai cu -> moi"),
                bulletItem("Cap duyet thay doi"),
                bulletItem("Ly do tu choi/tra lai (neu co)"),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 8. PHASE 7: PRE-APPROVAL RULES
                // ═══════════════════════════════════════════════════════════════
                heading1("8. Phase 7: Quy tac kiem tra truoc phe duyet"),

                heading2("Mo ta"),
                para([
                    normal("Khi approver mo don, he thong "),
                    bold("tu dong kiem tra"),
                    normal(" cac quy tac nghiep vu va hien canh bao (khong block, chi canh bao)."),
                ]),

                heading2("5 quy tac kiem tra"),
                makeTable(
                    ["#", "Ma", "Dieu kien", "Muc do"],
                    [
                        ["1", "BUDGET_HIGH", "Tong gia tri don > 500 trieu VND", "Warning"],
                        ["2", "EXCESS_MOS", "Ma hang co MOS > 6 thang nhung van dat", "Warning"],
                        ["3", "CRITICAL_STOCK", "Ma hang ton kho cuc thap (MOS < 0.5 thang)", "Info"],
                        ["4", "OOS_NOT_ORDERED", "Ma hang het hang (OOS) nhung khong dat", "Info"],
                        ["5", "LARGE_ITEM_ORDER", "Don le 1 ma hang > 100 trieu VND", "Warning"],
                    ],
                    [500, 2200, 4660, 2000]
                ),

                heading2("Muc do canh bao"),
                bulletItem([bold("error (do): "), normal("Chan phe duyet, bat buoc sua")]),
                bulletItem([bold("warning (vang): "), normal("Canh bao, nguoi duyet tu quyet dinh")]),
                bulletItem([bold("info (xanh): "), normal("Thong tin tham khao")]),
                spacer(),
                para([italic("Hien tai chua co rule nao muc error - tat ca chi la warning/info, nguoi duyet co the bo qua.")]),

                heading2("Tuy chinh nguong"),
                para([normal("Sua file "), code("utils/approval-rules.ts"), normal(":")]),
                ...codeBlock([
                    "const BUDGET_THRESHOLD = 500_000_000;  // 500M VND",
                    "const HIGH_MOS_THRESHOLD = 6;          // 6 thang",
                    "const LOW_MOS_THRESHOLD = 0.5;         // 0.5 thang",
                ]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 9. PHASE 8: ESCALATION
                // ═══════════════════════════════════════════════════════════════
                heading1("9. Phase 8: Escalation & Deadline"),

                heading2("Mo ta"),
                para([
                    normal("Moi don co "),
                    bold("deadline 3 ngay lam viec"),
                    normal(". Qua han -> tu dong escalate len cap tren."),
                ]),

                heading2("Cau truc du lieu"),
                ...codeBlock([
                    "approval_requests.deadline       TIMESTAMPTZ  -- Han chot phe duyet",
                    "approval_requests.escalated_at   TIMESTAMPTZ  -- Thoi diem escalate",
                    "approval_requests.escalated_to   TEXT         -- ID nguoi duoc escalate",
                ]),

                heading2("Tinh deadline"),
                para([normal("He thong tu dong tinh deadline = "), bold("ngay gui + 3 ngay lam viec"), normal(" (bo thu 7, CN):")]),
                ...codeBlock([
                    "Gui thu 2 -> Deadline thu 5",
                    "Gui thu 4 -> Deadline thu 2 tuan sau",
                    "Gui thu 6 -> Deadline thu 4 tuan sau",
                ]),

                heading2("Cron Job Escalation"),
                para([bold("Edge Function: "), code("supabase/functions/check-escalation/index.ts")]),
                para("Chay hang ngay qua Supabase Cron, thuc hien:"),
                numberItem([normal("Tim don qua han: "), code("deadline < now()"), normal(" + status IN (pending, in_progress)")]),
                numberItem("Lay workflow de tim approver cap tiep theo"),
                numberItem([normal("Danh dau "), code("escalated_at"), normal(" = thoi gian hien tai")]),
                numberItem("Gui email thong bao escalation"),

                heading2("UI hien thi"),
                para("Tren trang Phe duyet Dat hang (ApprovalQueue):"),
                bulletItem([bold("Badge \"Qua han\""), normal(" - neu deadline < now")]),
                bulletItem([bold("Thoi gian con lai"), normal(" - countdown den deadline")]),
                bulletItem([bold("Da escalate"), normal(" - neu don da bi escalate")]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 10. CAU TRUC FILE
                // ═══════════════════════════════════════════════════════════════
                heading1("10. Cau truc file"),

                heading2("Files moi tao"),
                makeTable(
                    ["File", "Muc dich"],
                    [
                        ["hooks/useApprovalAuth.ts", "Hook phan quyen approval"],
                        ["components/AuthGuard.tsx", "Component bao ve quyen truy cap"],
                        ["types/approval.ts", "Types, constants, transition map"],
                        ["utils/approval-validation.ts", "Validation: state, reason, actions"],
                        ["utils/approval-rules.ts", "Pre-approval business rules"],
                        ["supabase/functions/check-escalation/index.ts", "Edge Function: cron escalation"],
                    ],
                    [4500, 4860]
                ),
                spacer(),

                heading2("7 SQL Migrations"),
                makeTable(
                    ["File", "Noi dung"],
                    [
                        ["001_add_approval_profile_fields.sql", "approval_levels, department + GIN index"],
                        ["002_status_transition_validation.sql", "validate_status_transition() + trigger"],
                        ["003_add_reason_columns.sql", "rejection_reason, returned_reason"],
                        ["004_enforce_sequential_levels.sql", "enforce_sequential_level() trigger"],
                        ["005_add_version_column.sql", "version INT DEFAULT 1"],
                        ["006_enhance_audit_logging.sql", "metadata JSONB on approval_actions"],
                        ["007_add_deadline_escalation.sql", "deadline, escalated_at, escalated_to"],
                    ],
                    [4500, 4860]
                ),
                spacer(),

                heading2("Files da sua"),
                makeTable(
                    ["File", "Thay doi"],
                    [
                        ["utils/authContext.tsx", "Them approval_levels, department vao UserProfile"],
                        ["utils/supabase.ts", "Rewrite processApprovalAction + locking + audit"],
                        ["types/inventory.ts", "Them fields moi vao ApprovalRequest, ApprovalAction"],
                        ["pages/ApprovalQueue.tsx", "RBAC filtering, level badges"],
                        ["components/OrderReviewModal.tsx", "Reason UI, validation, pre-approval warnings"],
                    ],
                    [4500, 4860]
                ),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 11. HUONG DAN QUAN TRI
                // ═══════════════════════════════════════════════════════════════
                heading1("11. Huong dan quan tri"),

                heading2("Gan cap phe duyet cho user moi"),
                ...codeBlock([
                    "-- Xem danh sach user hien tai",
                    "SELECT id, full_name, role, approval_levels, department",
                    "FROM profiles",
                    "ORDER BY role, full_name;",
                    "",
                    "-- Gan cap 1 va 2 cho user",
                    "UPDATE profiles",
                    "SET approval_levels = ARRAY[1, 2],",
                    "    department = 'procurement'",
                    "WHERE id = 'uuid-cua-user';",
                ]),

                heading2("Thay doi deadline mac dinh"),
                para([normal("Sua "), code("utils/supabase.ts"), normal(" trong ham "), code("submitApprovalRequest()"), normal(":")]),
                ...codeBlock([
                    "// Mac dinh: 3 ngay lam viec",
                    "// Doi thanh 5 ngay:",
                    "let daysToAdd = 5; // thay vi 3",
                ]),

                heading2("Deploy cron escalation"),
                ...codeBlock([
                    "# Deploy Edge Function len Supabase",
                    "supabase functions deploy check-escalation \\",
                    "  --project-ref jczdnlydozcftvnqnixt",
                    "",
                    "# Setup cron schedule (chay hang ngay luc 8h sang VN)",
                    "SELECT cron.schedule(",
                    "    'check-escalation-daily',",
                    "    '0 1 * * *',  -- 1:00 UTC = 8:00 VN",
                    "    $$SELECT net.http_post(...)",
                    ");",
                ]),

                heading2("Rollback migration (neu can)"),
                ...codeBlock([
                    "-- Vi du: rollback Phase 5 (optimistic locking)",
                    "ALTER TABLE approval_requests DROP COLUMN IF EXISTS version;",
                    "",
                    "-- Rollback Phase 2 (state validation trigger)",
                    "DROP TRIGGER IF EXISTS trg_check_status_transition",
                    "  ON approval_requests;",
                    "DROP FUNCTION IF EXISTS check_status_transition();",
                    "DROP FUNCTION IF EXISTS validate_status_transition(TEXT, TEXT);",
                ]),

                divider(),

                // ═══════════════════════════════════════════════════════════════
                // 12. FAQ
                // ═══════════════════════════════════════════════════════════════
                heading1("12. FAQ"),

                para([bold("Q: User bi loi \"Don da bi thay doi, vui long refresh\" khi duyet?")]),
                para([normal("A: Co nguoi khac da thao tac tren don do truoc. Reload trang de lay du lieu moi nhat.")]),
                spacer(),

                para([bold("Q: Approver khong thay nut \"Phe duyet\"?")]),
                para([normal("A: Kiem tra "), code("approval_levels"), normal(" cua user. Neu don o cap 2 ma user chi co "), code("approval_levels = [1]"), normal(" thi khong the duyet.")]),
                spacer(),

                para([bold("Q: Don bi tu choi, muon sua lai?")]),
                para([code("rejected"), normal(" la trang thai cuoi. Planner can "), bold("tao don moi"), normal(". Neu muon cho sua, dung "), bold("Tra lai"), normal(" (returned) thay vi Tu choi.")]),
                spacer(),

                para([bold("Q: Cach xem lich su chi tiet 1 don?")]),
                para([normal("A: Mo don trong OrderReviewModal -> tab "), bold("Lich su"), normal(". Moi dong hien: ai, luc nao, thay doi gi, ly do.")]),
                spacer(),

                para([bold("Q: Escalation email khong gui?")]),
                para([normal("A: Kiem tra Edge Function "), code("check-escalation"), normal(" da deploy chua, va cron job da setup trong pg_cron chua. Xem logs trong Supabase Dashboard -> Edge Functions -> Logs.")]),
            ],
        },
    ],
});

// ── Generate ──
Packer.toBuffer(doc).then(buffer => {
    fs.writeFileSync("D:\\App\\v13\\APPROVAL_SYSTEM_GUIDE.docx", buffer);
    console.log("Created: APPROVAL_SYSTEM_GUIDE.docx (" + (buffer.length / 1024).toFixed(1) + " KB)");
});
