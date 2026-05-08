// xlsx is dynamically imported inside exportToExcel to keep the ~277KB raw / 91KB gz
// vendor chunk out of the initial bundle. Excel export is a user-triggered action.

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

/**
 * Xuất dữ liệu cảnh báo hết hàng ra Excel
 * @param data Danh sách dữ liệu chi tiết
 * @param reportDate Ngày báo cáo (YYYY-MM-DD)
 */
export const exportToExcel = async (data: ExportDataRow[], reportDate: string = new Date().toISOString().split('T')[0]) => {
    const XLSX = await import('xlsx');
    // 1. CHUẨN BỊ DỮ LIỆU SHEET 1 (DETAIL)
    const detailHeaders = ["STT", "SKU", "Tên Mục", "Tồn Kho", "Cầu/Ngày", "Ngày Cần Đặt", "Loại", "Số Lượng", "Trạng Thái"];
    
    const detailData = data.map((item, index) => [
        index + 1,
        item.sku,
        item.name,
        item.stock,
        parseFloat(item.demand.toFixed(2)), // Format số
        item.orderDate,
        item.type,
        item.qty,
        item.status.replace(/_/g, ' ')
    ]);

    // Tạo Worksheet từ mảng dữ liệu (bao gồm Header)
    const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailData]);

    // Format Column Widths (Auto-fit giả lập)
    const wscols = [
        { wch: 5 },  // STT
        { wch: 15 }, // SKU
        { wch: 40 }, // Tên
        { wch: 10 }, // Tồn
        { wch: 10 }, // Cầu
        { wch: 15 }, // Ngày
        { wch: 8 },  // Loại
        { wch: 10 }, // SL
        { wch: 20 }  // Trạng thái
    ];
    wsDetail['!cols'] = wscols;

    // Frozen Header Row (Cố định dòng 1)
    wsDetail['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // 2. CHUẨN BỊ DỮ LIỆU SHEET 2 (STATISTICS)
    // Tính toán thống kê
    const stats = {
        total: data.length,
        critical: data.filter(i => i.status === 'PHAI_DAT_NGAY').length,
        week: data.filter(i => i.status.includes('TUAN')).length,
        month: data.filter(i => i.status.includes('THANG') || i.status === 'AN_TOAN').length,
        totalAir: data.filter(i => i.type === 'AIR').reduce((sum, i) => sum + i.qty, 0),
        totalSea: data.filter(i => i.type === 'SEA').reduce((sum, i) => sum + i.qty, 0),
    };

    const statsData = [
        ["THỐNG KÊ TỔNG QUAN", ""],
        ["Ngày báo cáo", reportDate],
        ["", ""],
        ["Tổng số mục", stats.total],
        ["🔴 Khẩn cấp (Phải đặt ngay)", stats.critical],
        ["🟠 Cảnh báo tuần này", stats.week],
        ["🟡 Theo dõi tháng này", stats.month],
        ["", ""],
        ["📦 TỔNG NHU CẦU ĐẶT HÀNG", ""],
        ["✈️ Tổng Air (chiếc)", stats.totalAir],
        ["🌊 Tổng Sea (chiếc)", stats.totalSea]
    ];

    const wsStats = XLSX.utils.aoa_to_sheet(statsData);
    wsStats['!cols'] = [{ wch: 30 }, { wch: 15 }]; // Width cho sheet stats

    // 3. TẠO WORKBOOK & APPEND SHEETS
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDetail, "Chi Tiet");
    XLSX.utils.book_append_sheet(wb, wsStats, "Thong Ke");

    // 4. XUẤT FILE
    XLSX.writeFile(wb, `Canh_bao_het_hang_${reportDate}.xlsx`);
};
