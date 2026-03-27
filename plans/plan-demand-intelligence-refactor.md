# Plan: Demand Intelligence V1 — Phase 1 Only
*Tinh gọn, thực tế, đo được. Không over-engineer.*

---

## Scope: CHỈ Phase 1

### Làm ngay
1. ✅ Safety stock theo service level + LOIS mapping
2. ✅ ROP = d̄ × LT + SS (dùng engine computed fields)
3. ✅ Phân 5 nhóm hành động (loại bỏ NORMAL)
4. ✅ Insight text cụ thể với số liệu thực
5. ✅ KPI cards: forecast accuracy, stockout rate, overstock value, service level thực tế
6. ✅ Bỏ Lead Time view + Google GenAI

### KHÔNG làm (Phase 2-3)
- ❌ Croston/SBA/TSB
- ❌ Auto model selection (ARIMA, Prophet, XGBoost)
- ❌ Multi-echelon optimization
- ❌ Causal drivers (promotion, seasonality)
- ❌ SKU demand pattern classification (smooth/erratic/intermittent/lumpy)

---

## 1. Thống kê bổ sung (tính trong DemandIntelligence, dùng data có sẵn)

### 1.1 σd (demand std dev) — từ SalesHistory 12M
```ts
const history = item.SalesHistory;  // 12 monthly values
const mean = history.reduce((a,b) => a+b, 0) / history.length;
const variance = history.reduce((a,b) => a + (b - mean) ** 2, 0) / history.length;
const sigmaD = Math.sqrt(variance);
// Hoặc dùng sẵn: sigmaD = computed.cv * mean (cv đã compute trong engine)
```

### 1.2 Z-score theo LOIS → Service Level
```ts
function getZScore(loisGroup: string): number {
    const lois = (loisGroup || '').trim().toUpperCase();
    if (['1','2','3'].includes(lois)) return 2.05;  // 98% — fast movers
    if (['4','5'].includes(lois)) return 1.65;       // 95% — medium
    if (['6','7'].includes(lois)) return 1.28;       // 90% — slow
    if (lois === '8' || lois === 'E' || lois === 'N' || lois === 'A' || lois === 'V') return 0.84; // 80% — obsolete
    if (lois === 'I') return 0;                       // 0% — inactive
    return 1.65;                                      // default 95%
}
```

### 1.3 Enhanced Safety Stock
```ts
// LT từ engine (ngày), convert sang tháng vì σd là monthly
const ltMonths = computed.effectiveLT / 30;
const Z = getZScore(item.LOISGroup);
const newSS = Z * sigmaD * Math.sqrt(ltMonths);
```

### 1.4 Enhanced ROP
```ts
const newROP = computed.demandMonthly * ltMonths + newSS;
```

### 1.5 Forecast Accuracy (simple)
```ts
const actualM1 = item.SalesHistory[11];  // last month actual
const forecastM1 = item.BaseForecast || 0;
const accuracy = forecastM1 > 0
    ? Math.max(0, 100 - (Math.abs(actualM1 - forecastM1) / forecastM1) * 100)
    : null;
const forecastBias = actualM1 - forecastM1;  // positive = under-forecast
```

---

## 2. Phân nhóm Intelligence (5 nhóm hành động)

Dùng computed fields từ engine + thống kê bổ sung ở trên.

| # | Nhóm | Điều kiện | Action Text |
|---|------|-----------|-------------|
| 🔴 | **STOCKOUT** | `available ≤ 0 && demandMonthly > 0` OR `isBOCritical` OR `mos < 0.25 && demandMonthly > 0.5` | Order AIR |
| 🟠 | **RISK** | `stockoutRiskFlag && mos < 1.5 && !isStopBiz` OR `available < newROP && demandMonthly > 1 && available > 0` | Expedite PO |
| 🟡 | **SPIKE** | `actualM1 > mean + 2*sigmaD && actualM1 >= 5` OR `slope > 2 && cv < 1.2 && mos < 3` | Review FC |
| 🔵 | **OVERSTOCK** | `excessQty > 0 && mos > 6` OR `mos > 12 && demandMonthly > 0` OR `isStopBiz && available > 0` | Transfer/Cắt PO |
| 🟢 | **DECLINING** | `slope < -2 && avg12M > 5 && mos > 3` OR `forecastLinReg < 0.3 * avg12M && avg12M > 10` | Hold PO |
| ⬜ | **NORMAL** | Còn lại → **ẨN** | - |

Priority khi item match nhiều nhóm: STOCKOUT > RISK > SPIKE > OVERSTOCK > DECLINING

---

## 3. KPI Dashboard Cards (5 cards)

| Card | Metric | Tính toán |
|------|--------|-----------|
| 🔴 **Hết hàng** | Count STOCKOUT + tổng gap value | Σ stockoutGapValue của nhóm STOCKOUT |
| 🟠 **Rủi ro** | Count RISK + count items dưới ROP | Σ items có available < newROP |
| 🟡 **Nhu cầu tăng** | Count SPIKE | Items có demand spike |
| 🔵 **Tồn dư** | Count OVERSTOCK + tổng excess value | Σ excessValue |
| 📊 **FC Accuracy** | Trung bình accuracy% toàn bộ | mean(accuracy) của items có FC > 0 |

---

## 4. UI Layout

### 4.1 Không có header riêng (đã là sub-tab Dashboard)

### 4.2 Summary Cards → Filter Bar → Table

### 4.3 Table Columns
| Cột | Width | Data |
|-----|-------|------|
| # | 40px | index |
| Nhóm | 90px | Badge màu (STOCKOUT/RISK/SPIKE/OVERSTOCK/DECLINING) |
| SKU | 220px | ItemCode + ItemName + TypeCar badge |
| Trend | 120px | Sparkline 12M (giữ nguyên component) |
| Demand | 100px | actualM1 / FC + accuracy% |
| Tồn kho | 130px | available / newROP / stockMax |
| MOS | 60px | mos (color: red <1, amber 1-3, green 3-6, blue >6) |
| Pipeline | 90px | TotalPO |
| Gap/Excess | 110px | stockoutGapQty hoặc excessQty + value |
| Hành động | 280px | Insight text |

### 4.4 Insight Templates
```
STOCKOUT:  "HẾT HÀNG — Demand {demandMonthly}/th, BO {backorder}.
            PO: {totalPO}. → AIR {suggestedBO} units"

RISK:      "Còn {mos}M — dưới ROP {newROP}. Thiếu {gap} units.
            → Expedite hoặc AIR {suggestedBO}"

SPIKE:     "Bán {actualM1} vs TB {mean} (+{pct}%).
            → Tăng FC lên {forecastLinReg}/th"

OVERSTOCK: "Tồn {mos}M, thừa {excessQty} = {excessValue}đ.
            → {hasPO ? 'Cắt PO ' + totalPO : 'Transfer'}"

DECLINING: "Giảm {slope}/th. TB12M={avg12M} → {forecastLinReg}.
            → Hold PO, giảm FC"
```

---

## 5. Implementation Details

### 5.1 Files thay đổi
- **`pages/DemandIntelligence.tsx`** — REWRITE (giữ Sparkline component)
- **`pages/Dashboard.tsx`** — truyền `enrichedData` + `settings` thay vì raw `data`
- **`App.tsx`** — cleanup props không dùng

### 5.2 DemandIntelligence props mới
```tsx
interface DemandIntelligenceProps {
    data: InventoryItem[];        // enrichedData (có computed fields)
    onItemSelect: (item: InventoryItem) => void;
    initialState?: any;
    onSaveState?: (state: any) => void;
}
// BỎ: draftData, onUpdateDraft
```

### 5.3 Xóa imports/components
- ❌ `GoogleGenAI`
- ❌ `StockoutReportWithLeadTime`
- ❌ `SupplyHealthBar` component
- ❌ `ActionButton` component
- ❌ `handleLeadTimeAction` function
- ❌ viewMode state (ANALYTICS/LEAD_TIME)

### 5.4 Dashboard.tsx changes
```tsx
// Trước:
<DemandIntelligence data={data} ... draftData={draftData} onUpdateDraft={onUpdateDraft} />

// Sau:
<DemandIntelligence data={enrichedData} onItemSelect={onItemSelect}
    initialState={demandInitialState} onSaveState={onSaveDemandState} />
```

---

## 6. Đo hiệu quả (KPIs theo dõi sau deploy)
- Tỷ lệ stockout giảm sau khi planner dùng nhóm STOCKOUT/RISK
- Giá trị excess giảm sau khi xử lý nhóm OVERSTOCK
- Forecast accuracy trend theo tháng
- Số items trong mỗi nhóm thay đổi theo thời gian
