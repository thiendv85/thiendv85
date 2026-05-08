// exceljs is dynamically imported to keep ~250KB raw / ~80KB gz vendor chunk
// out of the initial bundle. Excel export is always a user-triggered action.

export interface ExportDataRow {
    sku: string;
    name: string;
    stock: number;
    demand: number;
    orderDate: string;
    type: 'AIR' | 'SEA' | 'NONE';
    qty: number;
    status: string; // PHAI_DAT_NGAY, v.v.
}

const triggerDownload = (buffer: ArrayBuffer, filename: string) => {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/**
 * Xuất dữ liệu cảnh báo hết hàng ra Excel
 * @param data Danh sách dữ liệu chi tiết
 * @param reportDate Ngày báo cáo (YYYY-MM-DD)
 */
export const exportToExcel = async (data: ExportDataRow[], reportDate: string = new Date().toISOString().split('T')[0]) => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();

    // 1. SHEET 1 (DETAIL)
    const wsDetail = wb.addWorksheet('Chi Tiet', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    wsDetail.columns = [
        { header: 'STT', key: 'stt', width: 5 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Tên Mục', key: 'name', width: 40 },
        { header: 'Tồn Kho', key: 'stock', width: 10 },
        { header: 'Cầu/Ngày', key: 'demand', width: 10 },
        { header: 'Ngày Cần Đặt', key: 'orderDate', width: 15 },
        { header: 'Loại', key: 'type', width: 8 },
        { header: 'Số Lượng', key: 'qty', width: 10 },
        { header: 'Trạng Thái', key: 'status', width: 20 },
    ];
    data.forEach((item, index) => {
        wsDetail.addRow({
            stt: index + 1,
            sku: item.sku,
            name: item.name,
            stock: item.stock,
            demand: parseFloat(item.demand.toFixed(2)),
            orderDate: item.orderDate,
            type: item.type,
            qty: item.qty,
            status: item.status.replace(/_/g, ' '),
        });
    });

    // 2. SHEET 2 (STATISTICS)
    const stats = {
        total: data.length,
        critical: data.filter(i => i.status === 'PHAI_DAT_NGAY').length,
        week: data.filter(i => i.status.includes('TUAN')).length,
        month: data.filter(i => i.status.includes('THANG') || i.status === 'AN_TOAN').length,
        totalAir: data.filter(i => i.type === 'AIR').reduce((sum, i) => sum + i.qty, 0),
        totalSea: data.filter(i => i.type === 'SEA').reduce((sum, i) => sum + i.qty, 0),
    };

    const wsStats = wb.addWorksheet('Thong Ke');
    wsStats.columns = [{ width: 30 }, { width: 15 }];
    wsStats.addRows([
        ['THỐNG KÊ TỔNG QUAN', ''],
        ['Ngày báo cáo', reportDate],
        ['', ''],
        ['Tổng số mục', stats.total],
        ['🔴 Khẩn cấp (Phải đặt ngay)', stats.critical],
        ['🟠 Cảnh báo tuần này', stats.week],
        ['🟡 Theo dõi tháng này', stats.month],
        ['', ''],
        ['📦 TỔNG NHU CẦU ĐẶT HÀNG', ''],
        ['✈️ Tổng Air (chiếc)', stats.totalAir],
        ['🌊 Tổng Sea (chiếc)', stats.totalSea],
    ]);

    // 3. WRITE & DOWNLOAD
    const buffer = await wb.xlsx.writeBuffer();
    triggerDownload(buffer as ArrayBuffer, `Canh_bao_het_hang_${reportDate}.xlsx`);
};

/**
 * Generic helper: xuất 1 sheet từ array of objects.
 */
export const exportObjectsToExcel = async (
    rows: Record<string, unknown>[],
    sheetName: string,
    filename: string,
) => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        ws.columns = headers.map(h => ({ header: h, key: h, width: 18 }));
        rows.forEach(r => ws.addRow(r));
    }

    const buffer = await wb.xlsx.writeBuffer();
    triggerDownload(buffer as ArrayBuffer, filename);
};
