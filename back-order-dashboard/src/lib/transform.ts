export interface RawBOData {
  DocDate: string;
  DocNo: string;
  OPropertyName: string;
  BranchCode?: string;
  BranchName?: string;
  BranchCodeReceipt?: string;
  ItemCode: string;
  ItemName: string;
  TypeCar?: string;
  QuantityRemainClose: string | number;
  EstimatedDescription?: string;
  EstimatedDate1?: string;
  RowId?: string;
  RowId_S2?: string;
  KhoNo: string;
  "SR-ĐL2": string;
}

export interface TransformedBOData extends RawBOData {
  Quantity: number;
  ParsedDocDate: Date;
  AgingDays: number;
  AgingBucket: string;
  DaysUntilETA: number | null;
  ETAGroup: string;
  isUrgent: boolean;
  Region: string;
}

const noETAKeywords = ["NCC chưa", "chờ thông tin", "NULL", "null", "nan", "SEA NCC", "CHỜ SEA"];

function parseDDMMYYYY(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === "" || dateStr === "(empty)") return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}

function cleanBOM(data: any[]): any[] {
  return data.map(row => {
    const newRow: any = {};
    for (const key in row) {
      const cleanKey = key.replace(/^\uFEFF/, "");
      newRow[cleanKey] = row[key];
    }
    return newRow;
  });
}

export function transformData(raw: RawBOData[]): TransformedBOData[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const cleanedRaw = cleanBOM(raw);
  
  return cleanedRaw.map(row => {
    const docDate = parseDDMMYYYY(row.DocDate) || new Date();
    const qty = typeof row.QuantityRemainClose === 'string' ? parseInt(row.QuantityRemainClose, 10) || 0 : row.QuantityRemainClose;
    
    // Aging
    const agingDays = Math.floor((today.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24));
    let agingBucket = "";
    if (agingDays <= 30) agingBucket = "0–30 ngày";
    else if (agingDays <= 60) agingBucket = "31–60 ngày";
    else if (agingDays <= 90) agingBucket = "61–90 ngày";
    else if (agingDays <= 180) agingBucket = "91–180 ngày";
    else agingBucket = ">180 ngày";

    // ETA
    let daysUntilETA: number | null = null;
    let etaGroup = "";
    
    const etaDate = row.EstimatedDate1 ? parseDDMMYYYY(row.EstimatedDate1) : null;
    if (etaDate) {
      daysUntilETA = Math.floor((etaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilETA < 0) etaGroup = "Quá hạn ETA";
      else if (daysUntilETA <= 14) etaGroup = "Sắp về (<14 ngày)";
      else etaGroup = "Có ETA (>14 ngày)";
    }

    if (etaGroup === "") {
      const desc = (row.EstimatedDescription || "").toLowerCase();
      const hasNoETAKeyword = noETAKeywords.some(k => desc.includes(k.toLowerCase()) || desc === "null");
      if (hasNoETAKeyword || !row.EstimatedDate1 || row.EstimatedDate1.trim() === "") {
        if (hasNoETAKeyword) etaGroup = "Chưa có ETA";
        else etaGroup = "Đang xử lý";
      }
    }

    return {
      ...row,
      Quantity: qty,
      ParsedDocDate: docDate,
      AgingDays: agingDays,
      AgingBucket: agingBucket,
      DaysUntilETA: daysUntilETA,
      ETAGroup: etaGroup,
      isUrgent: row.OPropertyName === "Khẩn" || row.OPropertyName === "Khẩn VOR",
      Region: row.KhoNo === "Kho MB" ? "Miền Bắc" : "Miền Nam"
    };
  });
}
