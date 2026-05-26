# Executive Report Page — Plan

## Mục tiêu
Trang `/report` mới — báo cáo tổng hợp KPI toàn hệ thống, in được (1-3 trang A4 linh hoạt), có AI-generated commentary.

## Data Sources (toàn bộ app)
| Domain | Metrics |
|--------|---------|
| Dashboard | Turnover, Stock Value, PO, OOS count, Risk, Excess, MOS |
| Ordering | Draft orders (qty, value), approval status pipeline |
| BackorderAnalytics | BO aging (30/60/90/90+), supplier delay, clearance rate |
| InventoryDistribution | NB/BB split, dealer stock, geographic coverage |
| Transfer | Proposed transfers, value moved, stockout resolved |
| Supersession | Active chains, transition progress |
| Demand Intelligence | Forecast accuracy, anomaly count, trend direction |

## Layout (Screen View)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: Company · Brand · Date · Nút [Print] [AI Refresh]  │
├─────────────────────────────────────────────────────────────┤
│ KPI CARDS (row 1): 5-6 thẻ chính                           │
│  Turnover | Stock Val | PO Pipeline | OOS | Excess | BO    │
├─────────────────────────────────────────────────────────────┤
│ CHARTS (row 2): 2-3 mini charts                            │
│  [Trend 12M sparkline] [LOIS distribution pie] [MOS hist]  │
├─────────────────────────────────────────────────────────────┤
│ MATRIX TABLE: LOIS breakdown (compact)                      │
├─────────────────────────────────────────────────────────────┤
│ SECONDARY METRICS (row 3): Ordering + BO + Transfer summary │
├─────────────────────────────────────────────────────────────┤
│ AI COMMENTARY: 3-5 bullet insights                          │
│  "OOS tăng 12% so với tháng trước, tập trung nhóm 1A..."   │
│  "Excess ratio 18% vượt target 15%, đề xuất review 2B..."  │
├─────────────────────────────────────────────────────────────┤
│ FOOTER: Timestamp · Page N/M · Source info                  │
└─────────────────────────────────────────────────────────────┘
```

## Print Layout (A4 Landscape)
- Page 1: Header + KPI cards + Charts + LOIS matrix
- Page 2 (nếu cần): Secondary metrics + AI commentary + footnotes
- Page 3 (nếu data nhiều): Detail breakdown by brand/source

## AI Commentary
- **Input**: JSON snapshot of KPIs + deltas vs previous period
- **Output**: 3-5 bullet Vietnamese insights (warnings, recommendations)
- **Provider**: TBD (interface abstracted, swap later)
- **Fallback**: Rule-based nếu AI unavailable
- **Cache**: localStorage 1h TTL (tránh gọi lại liên tục)

### Commentary Interface
```typescript
interface ReportCommentary {
  generate(snapshot: KPISnapshot): Promise<string[]>;
}

interface KPISnapshot {
  turnover: number;
  stockValue: number;
  oosCount: number;
  riskCount: number;
  excessPct: number;
  boValue: number;
  mosAvg: number;
  trendDirection: 'up' | 'down' | 'flat';
  // deltas vs previous
  deltaOOS: number;
  deltaExcess: number;
  deltaTurnover: number;
}
```

## Charts (SVG inline — no heavy lib)
1. **Sparkline 12M**: Turnover trend (inline SVG polyline)
2. **LOIS Pie**: Distribution by segment (SVG arc)
3. **MOS Histogram**: Bucket distribution (SVG bars)

Lý do inline SVG: printable, no canvas, lightweight.

## File Structure
```
pages/ExecutiveReport.tsx     — main page component
hooks/useReportData.ts        — aggregate data from all sources
utils/reportCommentary.ts     — AI commentary interface + rule fallback
utils/reportCharts.ts         — SVG chart generators
```

## Implementation Phases

### Phase 1: Static Report (no AI)
1. Create `pages/ExecutiveReport.tsx` with route
2. Create `hooks/useReportData.ts` — aggregate from existing hooks
3. KPI cards + LOIS matrix table (reuse Dashboard logic)
4. Print CSS (@page A4 landscape)
5. Inline SVG charts (sparkline, pie, histogram)

### Phase 2: AI Commentary
1. Create `utils/reportCommentary.ts` interface
2. Rule-based fallback implementation
3. AI provider integration (when chosen)
4. Cache layer (localStorage)

### Phase 3: Polish
1. Responsive screen layout
2. Dark/light theme support
3. Export PDF option (optional)
4. Period selector (this month vs custom range)

## Dependencies
- Existing hooks: useAppBootstrap, useInventoryAnalytics, useSalesAnalytics
- Existing utils: formatCurrency, LOIS_HIERARCHY
- New: route registration in App.tsx / router config

## Constraints
- No heavy chart library (recharts/chart.js) — inline SVG only for print
- Print must work without JS (static HTML)
- AI call optional — page renders without it
- Data reuse — no duplicate Supabase queries
