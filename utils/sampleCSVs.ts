/**
 * Sample CSV templates — hiển thị bên cạnh upload input để user tải mẫu đúng định dạng.
 * Mỗi entry: { filename, content }. Content = header + 2-3 dòng ví dụ.
 *
 * Thêm template mới: thêm key vào SAMPLE_CSVS + tham chiếu trong UI qua <SampleCSVButton>.
 */

export interface SampleCSV {
    filename: string;
    content: string;
    description?: string;
}

export const SAMPLE_CSVS: Record<string, SampleCSV> = {
    'part-affinity': {
        filename: 'mau-ma-lien-quan.csv',
        description: 'Mã liên quan A↔B (mandatory/recommended)',
        content: `PartA,PartB,Type,Score,Note
BRK001,PAD001,mandatory,100,Bộ phanh kèm má phanh
BRK001,SCR001,mandatory,100,Bộ phanh kèm bulông
OIL001,FLT001,recommended,90,Thay nhớt nên thay lọc nhớt
OIL001,GSK001,recommended,60,Gioăng nắp dầu nên thay khi mở
WHL001,LUG001,mandatory,100,Bánh xe kèm tắc kê
WHL001,BAL001,recommended,40,Cân bằng bánh xe
`,
    },
    'supersession': {
        filename: 'mau-ma-thay-the.csv',
        description: 'Mã thay thế (Old → New)',
        content: `OldPartNumber,NewPartNumber,Interchangeable
ABC001,XYZ001,true
ABC002,XYZ002,false
ABC003,XYZ003,1
`,
    },
    'kitting': {
        filename: 'mau-kitting.csv',
        description: 'Gói sửa chữa (Repair Package)',
        content: `SetPartsCode,SetParts,ItemCode,ItemNameEng,Qty,ModelCar,EngineCode,UnitPrice
SET001,Gói Nhớt 10K km,OIL001,Engine Oil 5W30,1,CX5,SH-VPTR,250000
SET001,Gói Nhớt 10K km,FLT001,Oil Filter,1,CX5,SH-VPTR,120000
SET001,Gói Nhớt 10K km,GSK001,Drain Plug Gasket,1,CX5,SH-VPTR,15000
SET002,Gói Phanh Trước,BRK001,Brake Disc Front,2,CX5,SH-VPTR,1200000
SET002,Gói Phanh Trước,PAD001,Brake Pad Front,1,CX5,SH-VPTR,450000
`,
    },
    'inventory-main': {
        filename: 'mau-ton-kho.csv',
        description: 'File tồn kho chính (header cơ bản)',
        content: `ItemCode,ItemName,BrandName,SourceId,LOISGroup,UnitCost_PP,QuantityInventory_NB,QuantityInventory_BB,Backorder,TotalPO
ABC001,Sample Part 1,MAZDA,MZ,1A,100000,50,30,5,20
ABC002,Sample Part 2,MAZDA,MZ,2B,150000,10,0,2,15
ABC003,Sample Part 3,BMW,BMW,3C,500000,5,5,1,0
`,
    },
    'monthly-coefficient': {
        filename: 'mau-he-so-thang.csv',
        description: 'File hệ số tháng (File B)',
        content: `ItemCode,Forecast,M0,M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11
ABC001,15.5,10,12,15,18,20,15,12,10,8,15,18,20
ABC002,8.2,5,6,8,10,12,8,6,5,4,8,10,12
`,
    },
};

/**
 * Trigger download CSV với BOM utf-8 (Excel mở đúng tiếng Việt).
 */
export function downloadSampleCSV(key: string): boolean {
    const sample = SAMPLE_CSVS[key];
    if (!sample) {
        return false;
    }
    const blob = new Blob(['﻿' + sample.content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = sample.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}
