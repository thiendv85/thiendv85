import { InventoryItem, LoisProfile } from '../../types/inventory';
import { AppSettings } from '../Settings';

interface LoisGroup {
    label: string;
    sub: string[];
    color: string;
}

interface GrandStats {
    grandTurnover: number;
    grandStock: number;
    grandPOVal: number;
    grandExcess: number;
    totalSKUs: number;
    grandNoStock: number;
    grandShort: number;
    grandExcessItems: number;
    grandBOItems: number;
    grandBOValue: number;
}

interface PrintData {
    curMatrix: Record<string, any>;
    curGS: GrandStats;
    simMatrix: Record<string, any>;
    simGS: GrandStats;
    deltaStockoutResolved: number;
    deltaExcessAdded: number;
    deltaStockValAdded: number;
}

export function openPrintWindow(opts: {
    data: InventoryItem[];
    appSettings?: AppSettings;
    loisProfiles: LoisProfile[];
    LOIS_HIERARCHY: LoisGroup[];
    formatCurrency: (val: number) => string;
    printData: PrintData;
}) {
    const { data, appSettings, loisProfiles, LOIS_HIERARCHY, formatCurrency, printData } = opts;

    const pd = new Date();
    const dateStr = pd.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = pd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    const brandLabel = (() => {
        const brands = Array.from(new Set(data.map(i => i.BrandName).filter(Boolean)));
        const sources = Array.from(new Set(data.map(i => i.SourceId).filter(Boolean)));
        if (brands.length === 1 && sources.length > 1) return `${brands[0]} · ${sources.length} nguồn`;
        if (brands.length > 1) return `Hỗn hợp · ${brands.length} thương hiệu`;
        if (brands.length === 1 && sources.length === 1) {
            const p = appSettings?.sourceProfiles?.find(
                p =>
                    p.brand?.toLowerCase() === (brands[0] ?? '').toLowerCase() &&
                    (p.id.toUpperCase() === (sources[0] ?? '').toUpperCase() ||
                        p.name.toLowerCase().includes((sources[0] ?? '').toLowerCase())),
            );
            if (p) return `${p.brand} · ${p.id} – ${p.name}`;
            return `${brands[0]} · ${sources[0]}`;
        }
        const p = appSettings?.sourceProfiles?.find(p => p.id === appSettings?.activeSourceId);
        if (p) return `${p.brand || 'Thương hiệu'} · ${p.id} – ${p.name}`;
        return 'Tất cả thương hiệu';
    })();

    const fv = (v: number) => formatCurrency(v).replace(/ tr$/, '');

    const buildTableRows = (mx: Record<string, any>, gs: GrandStats) => {
        let rows = '';
        LOIS_HIERARCHY.forEach(group => {
            const hRow = {
                items: 0,
                turnover: 0,
                noStock: 0,
                short: 0,
                stockVal: 0,
                poVal: 0,
                boItems: 0,
                boValue: 0,
                excessItems: 0,
                excessVal: 0,
                bmwCount: 0,
                trendSum: 0,
                trendCount: 0,
            };
            group.sub.forEach(k => {
                if (mx[k]) {
                    hRow.items += mx[k].items;
                    hRow.turnover += mx[k].turnover;
                    hRow.noStock += mx[k].noStock;
                    hRow.short += mx[k].short;
                    hRow.stockVal += mx[k].stockVal;
                    hRow.poVal += mx[k].poVal;
                    hRow.boItems += mx[k].boItems;
                    hRow.boValue += mx[k].boValue;
                    hRow.excessItems += mx[k].excessItems;
                    hRow.excessVal += mx[k].excessVal;
                    hRow.bmwCount += mx[k].bmwCount;
                    hRow.trendSum += mx[k].trendSum;
                    hRow.trendCount += mx[k].trendCount;
                }
            });
            if (hRow.items === 0) return;
            const hTrend = hRow.trendCount > 0 ? hRow.trendSum / hRow.trendCount : 0;
            const hExPct = hRow.stockVal > 0 ? (hRow.excessVal / hRow.stockVal) * 100 : 0;
            const hTurnPct = gs.grandTurnover > 0 ? (hRow.turnover / gs.grandTurnover) * 100 : 0;
            const hMOS = hRow.turnover > 0 ? (hRow.stockVal * 12) / hRow.turnover : 0;

            rows += `<tr class="group-hdr">
                <td>${group.label}</td>
                <td class="r">${fv(hRow.turnover)}<span class="trend ${hTrend > 0 ? 'up' : 'dn'}">${hTrend > 0 ? '↑' : '↓'}${Math.abs(hTrend).toFixed(0)}%</span></td>
                <td class="r blue">${hTurnPct.toFixed(1)}%</td>
                <td class="c">${hRow.items.toLocaleString()}</td>
                <td class="c ${hRow.noStock > 0 ? 'red' : ''}">${hRow.noStock > 0 ? hRow.noStock.toLocaleString() : '-'}</td>
                <td class="c ${hRow.short > 0 ? 'amb' : 'muted'}">${hRow.short > 0 ? hRow.short.toLocaleString() : '-'}</td>
                <td class="r grn">${fv(hRow.stockVal)}</td>
                <td class="c ${hMOS > 6 ? 'red' : hMOS > 3 ? 'amb' : 'grn'}">${hMOS > 0 ? hMOS.toFixed(1) : '-'}M</td>
                <td class="r blue">${fv(hRow.poVal)}</td>
                <td class="c ${hRow.boItems > 0 ? 'red' : 'muted'}">${hRow.boItems > 0 ? hRow.boItems.toLocaleString() : '-'}</td>
                <td class="r ${hRow.boValue > 0 ? 'red' : 'muted'}">${fv(hRow.boValue)}</td>
                <td class="c muted">${hRow.excessItems > 0 ? hRow.excessItems.toLocaleString() : '-'}</td>
                <td class="r muted">${fv(hRow.excessVal)}</td>
                <td class="c ${hExPct > 15 ? 'red' : 'grn'}">${hExPct.toFixed(1)}%</td>
            </tr>`;

            if (group.sub.length > 1)
                group.sub.forEach(k => {
                    if (!mx[k] || mx[k].items === 0) return;
                    const d = mx[k];
                    const trend = d.trendCount > 0 ? d.trendSum / d.trendCount : 0;
                    const exPct = d.stockVal > 0 ? (d.excessVal / d.stockVal) * 100 : 0;
                    const turnPct = gs.grandTurnover > 0 ? (d.turnover / gs.grandTurnover) * 100 : 0;
                    const dMOS = d.turnover > 0 ? (d.stockVal * 12) / d.turnover : 0;
                    const tgtCfg = loisProfiles.find(p => p.id === k) || null;
                    const tgtMOS = tgtCfg ? tgtCfg.targetMOS : null;
                    const tgtEx = tgtCfg ? tgtCfg.targetExcessPct : null;
                    const dDesc = tgtCfg ? tgtCfg.name : '';

                    const mosOk = tgtMOS && dMOS > 0 ? dMOS >= tgtMOS * 0.5 && dMOS <= tgtMOS * 1.5 : null;
                    const exOk = tgtEx ? exPct <= tgtEx : null;

                    rows += `<tr class="sub-row">
                    <td class="indent">${k}${dDesc ? ` <span style="font-weight:400;color:#555;font-size:6pt">— ${dDesc}</span>` : ''}</td>
                    <td class="r">${fv(d.turnover)}<span class="trend ${trend > 0 ? 'up' : 'dn'}">${trend > 0 ? '↑' : '↓'}${Math.abs(trend).toFixed(0)}%</span></td>
                    <td class="r blue">${turnPct.toFixed(1)}%</td>
                    <td class="c">${d.items.toLocaleString()}</td>
                    <td class="c ${d.noStock > 0 ? 'red' : 'muted'}">${d.noStock > 0 ? d.noStock.toLocaleString() : '-'}</td>
                    <td class="c ${d.short > 0 ? 'amb' : 'muted'}">${d.short > 0 ? d.short.toLocaleString() : '-'}</td>
                    <td class="r grn">${fv(d.stockVal)}</td>
                    <td class="c ${mosOk === true ? 'grn' : mosOk === false ? 'red' : 'muted'}">${dMOS > 0 ? dMOS.toFixed(1) : '-'}M${tgtMOS ? ` <small>🎯${tgtMOS}M</small>` : ''}</td>
                    <td class="r blue">${fv(d.poVal)}</td>
                    <td class="c ${d.boItems > 0 ? 'red' : 'muted'}">${d.boItems > 0 ? d.boItems.toLocaleString() : '-'}</td>
                    <td class="r ${d.boValue > 0 ? 'red' : 'muted'}">${fv(d.boValue)}</td>
                    <td class="c muted">${d.excessItems > 0 ? d.excessItems.toLocaleString() : '-'}</td>
                    <td class="r muted">${fv(d.excessVal)}</td>
                    <td class="c ${exOk === true ? 'grn' : exOk === false ? 'red' : 'muted'}">${exPct.toFixed(1)}%${tgtEx ? ` <small>🎯≤${tgtEx}%</small>` : ''}</td>
                </tr>`;
                });
        });
        return rows;
    };

    const makeFooter = (gs: GrandStats) => {
        const exPct = gs.grandStock > 0 ? (gs.grandExcess / gs.grandStock) * 100 : 0;
        const gMOS = gs.grandTurnover > 0 ? (gs.grandStock * 12) / gs.grandTurnover : 0;
        return `<tr class="footer-row">
            <td>TỔNG CỘNG</td>
            <td class="r">${fv(gs.grandTurnover)}</td>
            <td class="r">100%</td>
            <td class="c">${gs.totalSKUs.toLocaleString()}</td>
            <td class="c red">${gs.grandNoStock.toLocaleString()}</td>
            <td class="c amb">${gs.grandShort.toLocaleString()}</td>
            <td class="r grn">${fv(gs.grandStock)}</td>
            <td class="c">${gMOS > 0 ? gMOS.toFixed(1) : '-'}M</td>
            <td class="r blue">${fv(gs.grandPOVal)}</td>
            <td class="c red">${gs.grandBOItems.toLocaleString()}</td>
            <td class="r red">${fv(gs.grandBOValue)}</td>
            <td class="c muted">${gs.grandExcessItems.toLocaleString()}</td>
            <td class="r muted">${fv(gs.grandExcess)}</td>
            <td class="c grn">${exPct.toFixed(1)}%</td>
        </tr>`;
    };

    const { curMatrix, curGS, simMatrix, simGS } = printData;

    const tableHTML = (isSimulation: boolean) => {
        const mx = isSimulation ? simMatrix : curMatrix;
        const gs = isSimulation ? simGS : curGS;
        const exPctGrand = gs.grandStock > 0 ? (gs.grandExcess / gs.grandStock) * 100 : 0;
        return `
        <div class="page-header">
            <div class="logo-area"><div class="logo-box">ATP</div><div><div class="company-name">Auto Parts Governance</div><div class="page-title">Báo cáo Tồn Kho</div><div class="brand-line">Thương hiệu: <strong>${brandLabel}</strong></div></div></div>
            <div class="header-right">
                <div class="badge">${isSimulation ? '✦ SIMULATION ACTIVE – Bao gồm Dự Thảo + PO' : '✔ HIỆN TẠI – Tồn kho thực tế'}</div>
                <div class="header-meta">In lúc: ${dateStr} — ${timeStr} &nbsp;|&nbsp; SKU: ${gs.totalSKUs} &nbsp;|&nbsp; <span class="red">OOS: ${gs.grandNoStock}</span> &nbsp;|&nbsp; <span class="amb">Risk: ${gs.grandShort}</span></div>
            </div>
        </div>
        <div class="kpi-bar">
            <div class="kpi-card">
                <div class="kpi-label">Doanh số vốn (12 tháng)</div>
                <div class="kpi-value">${formatCurrency(gs.grandTurnover)}</div>
                <div class="kpi-sub">Tổng doanh thu theo giá vốn</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Tồn kho hiện hữu</div>
                <div class="kpi-value">${formatCurrency(gs.grandStock)}</div>
                <div class="kpi-sub">Giá trị tồn (GH)</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Hàng đang về (PO)</div>
                <div class="kpi-value">${formatCurrency(gs.grandPOVal)}</div>
                <div class="kpi-sub">Giá trị Pipeline</div>
            </div>
            <div class="kpi-card kpi-alert">
                <div class="kpi-label">Giá trị dư thừa</div>
                <div class="kpi-value">${formatCurrency(gs.grandExcess)}</div>
                <div class="kpi-sub">${exPctGrand.toFixed(1)}% tồn kho — ${gs.grandExcessItems} SKU</div>
            </div>
        </div>
        ${isSimulation ? `<div class="delta-bar"><div class="delta-card"><div class="delta-label">Stockout Resolved</div><div class="delta-val">-${printData.deltaStockoutResolved}</div></div><div class="delta-card"><div class="delta-label">Capital Added</div><div class="delta-val">${formatCurrency(printData.deltaStockValAdded)}</div></div><div class="delta-card"><div class="delta-label">Excess Added</div><div class="delta-val">${formatCurrency(printData.deltaExcessAdded)}</div></div></div>` : ''}
        <table>
            <colgroup>
                <col style="width:105px"><col style="width:75px"><col style="width:45px">
                <col style="width:40px"><col style="width:40px"><col style="width:40px">
                <col style="width:75px"><col style="width:55px"><col style="width:70px">
                <col style="width:40px"><col style="width:70px">
                <col style="width:40px"><col style="width:70px"><col style="width:50px">
            </colgroup>
            <thead>
                <tr>
                    <th>Phân khúc</th><th class="r">Turn. (tr)</th><th class="r">% Tr</th><th class="c">SKU</th>
                    <th class="c">OOS</th><th class="c">Risk</th><th class="r">Stock (tr)</th>
                    <th class="c">MOS</th><th class="r">PO (tr)</th>
                    <th class="c">BO #</th><th class="r">BO Val</th>
                    <th class="c">Exc #</th><th class="r">Exc Val</th><th class="c">% Exc</th>
                </tr>
            </thead>
            <tbody>${buildTableRows(mx, gs)}</tbody>
            <tfoot>${makeFooter(gs)}</tfoot>
        </table>
        <div class="footnote"><span>${isSimulation ? '* Simulation = Tồn kho + PO đang chờ + Dự thảo đặt hàng' : '* OOS = Hết hàng | Risk = Dưới ROP | Exc = Tồn dư vượt Max'}</span><span>Trang ${isSimulation ? '2' : '1'} / 2 — ${isSimulation ? 'Simulation Active' : 'Hiện Tại'}</span></div>
        `;
    };

    const html = `<!DOCTYPE html><html lang="vi"><head>
        <meta charset="UTF-8">
        <title>Báo cáo Tồn Kho – ${dateStr}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,600;0,700;0,900;1,400&display=swap" rel="stylesheet">
        <style>
            @page { size: A4 landscape; margin: 6mm 6mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Noto Sans', Arial, sans-serif; font-size: 7pt; color: #000; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page { width: 100%; page-break-after: always; }
            .page:last-child { page-break-after: avoid; }
            .page-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 3px; margin-bottom: 4px; }
            .logo-area { display: flex; align-items: center; gap: 10px; }
            .logo-box { width:32px; height:32px; background:#000; border-radius:4px; display:flex; align-items:center; justify-content:center; color:white; font-weight:900; font-size:8.5pt; flex-shrink:0; }
            .company-name { font-size:6pt; color:#666; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; }
            .page-title { font-size:11.5pt; font-weight:900; color:#000; line-height:1.2; }
            .brand-line { font-size:6.5pt; color:#333; font-weight:600; margin-top:1px; }
            .brand-line strong { color:#000; font-weight:900; }
            .header-right { text-align:right; }
            .badge { display:inline-block; padding:2px 10px; border-radius:3px; font-weight:700; font-size:7pt; margin-bottom:3px; border:1.5px solid #000; background:white; color:#000; }
            .header-meta { font-size:6.5pt; color:#555; }
            .kpi-bar { display:flex; gap:6px; margin-bottom:4px; }
            .kpi-card { flex:1; padding:3px 7px; border:1px solid #ddd; border-radius:3px; background:#fafafa; }
            .kpi-label { font-size:6pt; font-weight:700; text-transform:uppercase; color:#555; letter-spacing:0.05em; }
            .kpi-value { font-size:9.5pt; font-weight:900; color:#000; line-height:1.15; margin-top:0; }
            .kpi-sub { font-size:6pt; color:#555; margin-top:0; }
            .kpi-card.kpi-alert .kpi-value { text-decoration:underline; }
            .delta-bar { display:flex; gap:8px; margin-bottom:5px; }
            .delta-card { flex:1; padding:4px 8px; border-radius:3px; border:1px solid #ccc; background:#fafafa; }
            .delta-label { font-size:6.5pt; font-weight:700; text-transform:uppercase; color:#444; }
            .delta-val { font-size:11pt; font-weight:900; color:#000; }
            table { width:100%; border-collapse:collapse; font-size:7pt; table-layout: fixed; }
            thead th { background:#ececec; color:#000; padding:2px 2px; font-size:6.5pt; font-weight:900; text-transform:uppercase; border:1px solid #ccc; letter-spacing:0.01em; }
            tbody td { padding:1px 3px; border:1px solid #ddd; vertical-align:middle; line-height:1.05; color:#000; background:white; font-weight:500; overflow: hidden; }
            tr.group-hdr td { border-top:1.5px solid #999; border-bottom:1px solid #ccc; font-weight:900; background:#f5f5f5; color:#000; font-size:7pt; }
            tr.group-hdr td:first-child { border-left:3px solid #555; padding-left:4px; }
            tr.sub-row td { color:#000; font-weight:500; }
            tr.sub-row td.indent { padding-left:12px; color:#000; }
            tr.sub-row:nth-child(even) td { background:#fafafa; }
            tfoot td { background:#ececec; color:#000; font-weight:900; padding:3px 4px; border:1px solid #ccc; text-transform:uppercase; font-size:7.5pt; }
            .r { text-align:right; } .c { text-align:center; }
            .red { color:#d32f2f; font-weight:900; }
            .amb { color:#ed6c02; font-weight:800; }
            .grn { color:#2e7d32; font-weight:600; }
            .blue { color:#1976d2; font-weight:500; }
            .muted { color:#777; font-weight:400; }
            .up { color:#2e7d32; font-weight:700; } .dn { color:#d32f2f; font-weight:700; }
            .trend { margin-left:2px; font-size:5.5pt; }
            small { font-size:5.5pt; color:#666; display:inline; line-height:1; }
            .footnote { display:flex; justify-content:space-between; margin-top:3px; font-size:6pt; color:#444; border-top:1px solid #ddd; padding-top:2px; }
        </style>
    </head><body>
        <div class="page">${tableHTML(false)}</div>
        <div class="page">${tableHTML(true)}</div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=1200,height=800');
    if (!w) return alert('Trình duyệt đã chặn popup. Hãy cho phép popup để in.');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
        w.print();
    }, 600);
}
