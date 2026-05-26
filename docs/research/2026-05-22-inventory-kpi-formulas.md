# Công thức KPI Tồn kho & Báo cáo Executive — Research Report
*Generated: 2026-05-22 | Sources: 12 | Confidence: High*

## Executive Summary

Báo cáo tổng hợp công thức chuẩn ngành cho KPI tồn kho/supply chain, dùng làm
chuẩn cho trang `/report` và `inventoryEngine.ts` của V16. Các nhóm chính: hiệu
quả tồn kho (turnover, MOS, DSI), mức phục vụ (fill rate, service level,
stockout), bổ sung (ROP, safety stock, EOQ), forecast accuracy (MAPE/WMAPE/bias),
và composite score (perfect order). Lưu ý quan trọng: **fill rate ≠ service
level** — fill rate đo quá khứ (% nhu cầu đã đáp ứng), service level đo xác suất
tương lai không hết hàng.

---

## 1. Hiệu quả tồn kho (Inventory Efficiency)

### Inventory Turnover (vòng quay tồn kho)
```
Turnover = COGS / Average Inventory
hoặc     = Units Sold / Average Inventory
Average Inventory = (Beginning + Ending Inventory) / 2
```
Cao = bán nhanh. Thấp = overstock / obsolete / forecast kém.

### Days of Inventory (DSI / DOH)
```
DSI = (Average Inventory / COGS) × 365
hoặc = 365 / Turnover
```

### Months of Supply (MOS)
```
MOS = DSI / 30   (hoặc Weeks on Hand / 4.33)
MOS = Stock Value × 12 / Annual Turnover   ← V16 đang dùng
```
V16 dùng `MOS = stockVal × 12 / turnover` — tương đương, đúng chuẩn.

### Stock-to-Sales Ratio
```
Stock/Sales = Average Inventory / Net Sales
```

### GMROI (Gross Margin Return on Investment)
```
GMROI = Gross Margin / Average Inventory Cost
```
Đo lợi nhuận trên mỗi đồng vốn tồn — chưa có trong V16, nên thêm vào report.

---

## 2. Mức phục vụ (Service Metrics)

### Fill Rate
```
Unit Fill Rate  = Units Delivered (first shipment) / Units Ordered × 100
Order Fill Rate = Orders shipped complete first attempt / Total Orders × 100
Line Fill Rate  = Order lines filled / Total order lines × 100
```
**Đo quá khứ** — % nhu cầu thực tế đã đáp ứng.

### Service Level (Cycle Service Level)
```
Service Level = P(không hết hàng trong 1 chu kỳ đặt hàng)
```
**Đo xác suất tương lai** — dùng Z-score (90%→1.28, 95%→1.96, 99%→2.58).

> ⚠ Phân biệt: V16 nếu hiển thị "service level" phải rõ là fill rate (lịch sử)
> hay cycle service level (xác suất). CST của V16 hiện = coverage months, khác cả 2.

### Backorder Rate
```
Backorder Rate = Orders on backorder / Total incoming orders
```

### Backorder Aging
Phân nhóm BO theo tuổi: ≤30 / 31-60 / 61-90 / >90 ngày — V16 đã có (`boAging`).
Chuẩn ngành: flag item BO > 90 ngày là critical.

### Dead Stock / Obsolete
```
Dead Stock % = Unsellable goods / Total goods × 100
```
Nhận diện: turnover thấp + DOH cao + không bán 6-12 tháng.

---

## 3. Bổ sung & Đặt hàng (Replenishment)

### Reorder Point (ROP)
```
ROP = (Average Daily Demand × Lead Time) + Safety Stock
```
V16 dùng `rop = demandRateDaily × workingDaysInLT + safetyStock` — đúng chuẩn.

### Safety Stock (3 biến thể)
```
1. Demand variability:  SS = Z × σ_D × √LT
2. Lead time variability: SS = Z × σ_L × Avg Demand
3. Combined (chuẩn nhất): SS = Z × √(σ_D² × LT + σ_L² × Avg Demand²)
```
Z = z-score theo service level mong muốn.
V16 dùng `getZScore` — nên verify dùng công thức combined (3) cho chính xác.

### EOQ (Economic Order Quantity)
```
EOQ = √(2 × D × S / H)
D = annual demand, S = ordering cost/order, H = holding cost/unit/year
```
Chưa có trong V16 — không bắt buộc nếu dùng order-up-to policy.

### Carrying Cost
```
Carrying Cost % = (Capital + Risk + Storage + Service costs) / Total Inv Value × 100
```

---

## 4. Forecast Accuracy

### MAPE (Mean Absolute Percentage Error)
```
MAPE = mean( |Actual − Forecast| / Actual ) × 100
```
Nhược: sai lệch lớn với SKU bán chậm, không tính được khi Actual = 0.

### WMAPE / WAPE (Weighted — KHUYẾN NGHỊ)
```
WMAPE = Σ|Actual − Forecast| / Σ Actual × 100
```
Ổn định hơn MAPE, trọng số theo volume. **Chuẩn mặc định ngành 2026.**

### Forecast Bias
```
Bias = Σ(Forecast − Actual) / Σ Actual × 100
```
Dương = over-forecast, âm = under-forecast. Bias ≠ random error → cần sửa hệ thống.

### V16 demand forecast accuracy (đang dùng)
```
Accuracy = (1 − |Actual − Forecast| / Forecast) × 100
```
⚠ Chia cho Forecast (không phải Actual) — khác MAPE chuẩn. Cân nhắc đổi sang
WMAPE cho executive report.

---

## 5. Composite Score (Executive-level)

### Perfect Order Rate
```
Perfect Order % = OnTime% × InFull% × Damage-Free% × Accurate-Doc% × 100
```
Composite 4 thành phần nhân nhau — chuẩn vàng đo chất lượng đơn end-to-end.

### Nguyên tắc Executive Dashboard
- Kết hợp nhiều metric, không dựa 1 chỉ số (vd WMAPE + Bias cho forecast).
- Phân tầng: executive xem tổng hợp, staff drill-down chi tiết.
- Health score tổng = weighted hoặc multiplicative composite.

### Đề xuất Composite Health Score cho V16 `/report`
```
Inventory Health = w1·ServiceScore + w2·EfficiencyScore + w3·FreshnessScore
  ServiceScore    = 100 − (OOS% + RiskWeighted%)
  EfficiencyScore = clamp(MOS trong [target_low, target_high])
  FreshnessScore  = 100 − ExcessValue%/StockValue
```
Trọng số w1/w2/w3 cấu hình theo ưu tiên doanh nghiệp.

---

## Key Takeaways (áp vào V16)

1. **MOS của V16 đúng chuẩn** (`stockVal × 12 / turnover`). ROP đúng chuẩn.
2. **Đổi forecast accuracy → WMAPE** thay vì công thức chia-Forecast hiện tại —
   chuẩn ngành, ổn định cho SKU bán chậm. Thêm Bias riêng.
3. **Verify Safety Stock dùng công thức combined** (demand + lead time variance).
4. **Phân biệt rõ Fill Rate vs Service Level** trong UI — đang dễ nhầm với CST.
5. **Thêm GMROI** vào executive report — đo hiệu quả vốn, chưa có.
6. **Thêm Perfect Order Rate** nếu có data OnTime/InFull/Damage/Doc.
7. **Composite Health Score** cho `/report` — weighted Service+Efficiency+Freshness.
8. **Backorder aging > 90 ngày = critical** — V16 đã có `boAging`, đúng hướng.

---

## Sources

1. [33 Inventory Management KPIs — NetSuite](https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-management-kpis-metrics.shtml)
2. [11 Inventory Management KPIs 2026 — MRPeasy](https://www.mrpeasy.com/blog/inventory-management-kpis/)
3. [Inventory KPIs & Metrics — SupplyChainMath](https://supplychainmath.com/en/kpis-metrics.html)
4. [Advanced Reorder Point Formulas 2026 — Omniful](https://www.omniful.ai/blog/inventory-reorder-point-formulas-advanced-tips-2026)
5. [Safety Stock Formula 6 methods — ABC Supply Chain](https://abcsupplychain.com/safety-stock-formula-calculation/)
6. [Reorder Point Formula — Netstock](https://www.netstock.com/blog/reorder-point-formula/)
7. [Service Level vs Fill Rate — GAINSystems](https://gainsystems.com/blog/service-level-vs-fill-rate-key-differences-in-supply-chains/)
8. [Fill rate vs service level relationship — Netstock](https://www.netstock.com/blog/analyzing-the-relationship-between-fill-rate-and-service-level/)
9. [MAPE, WMAPE & Forecast Bias — DemandPlanning.net](https://demandplanning.net/mape-wmape-and-forecast-bias/)
10. [Forecast Accuracy Metrics — DemandPlan](https://www.demandplan.io/insights/forecast-accuracy-metrics)
11. [Obsolete Inventory Guide — NetSuite](https://www.netsuite.com/portal/resource/articles/inventory-management/obsolete-inventory.shtml)
12. [Supply Chain KPI Dashboard 6 metrics — Benchmarking Success](https://www.benchmarkingsuccess.com/top-supply-chain-kpis/)

## Methodology

Searched 6 queries (WebSearch) across inventory KPI, ROP/safety stock, fill rate
vs service level, excess/obsolete, forecast accuracy, executive dashboard.
Deep-read MRPeasy KPI article. Sub-questions: efficiency metrics, service
metrics, replenishment formulas, forecast accuracy, composite scoring.
Gap: GMROI và Perfect Order exact formula từ snippet, chưa deep-read full source.
