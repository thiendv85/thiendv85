import { useEffect, useState } from 'react';
import { listSupplierOrders, listOrderLines, listReceiptLots } from '../../utils/supabase/execution';
import { median } from '../../utils/execution/forecast';
import { computeOutstanding, computeAgingDays } from '../../utils/execution/outstanding';
import { STAGE_ORDER } from '../../types/execution';
import type { SupplierOrder, OrderLine, ReceiptLot, ExecStage } from '../../types/execution';

/** Số ngày dương lịch giữa hai mốc ISO (a − b). null nếu thiếu/lỗi ngày. */
function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const d = Math.floor((Date.parse(a) - Date.parse(b)) / 86_400_000);
  return Number.isNaN(d) ? null : d;
}

/** Đơn kèm dòng + lô của nó (đã nạp xong). */
interface LoadedLine {
  line: OrderLine;
  lots: ReceiptLot[];
}
interface LoadedOrder {
  order: SupplierOrder;
  lines: LoadedLine[];
}

interface Kpis {
  onTimeRate: number | null;
  leadAll: number | null;
  leadAir: number | null;
  leadSea: number | null;
  fillRate: number | null;
  outstandingOrderRate: number | null;
  avgAging: number | null;
  inTransitValue: number;
  stageCounts: Record<ExecStage, number>;
  agingBuckets: { '0-15': number; '16-30': number; '31-60': number; '>60': number };
}

const STAGE_LABELS: Record<ExecStage, string> = {
  S0_PENDING_SPLIT: 'Chờ tách',
  S1_SPLIT: 'Đã tách',
  S2_ORDERED: 'Đã đặt',
  S3_SUPPLIER_CONFIRMED: 'NCC xác nhận',
  S4_INVOICED: 'Đã hoá đơn',
  S5_ETD: 'Đã rời cảng',
  S6_ETA: 'Đến cảng',
  S7_CUSTOMS: 'Thông quan',
  S8_RECEIVED: 'Đã nhận',
  S9_DONE: 'Hoàn tất',
};

function computeKpis(data: LoadedOrder[]): Kpis {
  const now = new Date();

  // --- Lô đã về (có actual_wh_date) cho đúng hẹn + lead-time ---
  let lotsArrived = 0;
  let lotsOnTime = 0;
  const leadAllDays: number[] = [];
  const leadAirDays: number[] = [];
  const leadSeaDays: number[] = [];

  // --- Fill-rate đợt đầu ---
  let firstReceivedSum = 0;
  let orderedSum = 0;

  // --- Đơn còn nợ + tuổi nợ ---
  let outstandingOrders = 0;
  const agingOutstanding: number[] = [];
  const agingBuckets = { '0-15': 0, '16-30': 0, '31-60': 0, '>60': 0 };

  // --- Giá trị đang về ---
  let inTransitValue = 0;

  // --- Phân bố trạng thái ---
  const stageCounts = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {} as Record<ExecStage, number>);

  for (const { order, lines } of data) {
    stageCounts[order.stage] += 1;

    let orderOutstanding = 0;
    for (const { line, lots } of lines) {
      orderedSum += line.qty_ordered;
      orderOutstanding += computeOutstanding(line.qty_ordered, lots);

      // SL nhận của lô đầu mỗi dòng (lô sớm nhất theo actual_wh_date đã về)
      const arrived = lots
        .filter((l) => !!l.actual_wh_date)
        .sort((a, b) => Date.parse(a.actual_wh_date!) - Date.parse(b.actual_wh_date!));
      if (arrived.length > 0) firstReceivedSum += arrived[0].qty_received || 0;

      for (const lot of lots) {
        if (!lot.actual_wh_date) continue;
        lotsArrived += 1;
        if (lot.expected_wh_date && lot.actual_wh_date <= lot.expected_wh_date) lotsOnTime += 1;
        const lead = daysBetween(lot.actual_wh_date, order.ordered_at);
        if (lead != null) {
          leadAllDays.push(lead);
          if (order.ship_method === 'AIR') leadAirDays.push(lead);
          else if (order.ship_method === 'SEA') leadSeaDays.push(lead);
        }
      }

      // Giá trị đang về: đơn chưa hoàn tất, bỏ qua unit_price null
      if (order.stage !== 'S9_DONE' && line.unit_price != null) {
        inTransitValue += line.qty_ordered * line.unit_price;
      }
    }

    if (orderOutstanding > 0) {
      outstandingOrders += 1;
      const aging = computeAgingDays(order.ordered_at, now);
      if (aging != null) {
        agingOutstanding.push(aging);
        if (aging <= 15) agingBuckets['0-15'] += 1;
        else if (aging <= 30) agingBuckets['16-30'] += 1;
        else if (aging <= 60) agingBuckets['31-60'] += 1;
        else agingBuckets['>60'] += 1;
      }
    }
  }

  const totalOrders = data.length;

  return {
    onTimeRate: lotsArrived > 0 ? lotsOnTime / lotsArrived : null,
    leadAll: median(leadAllDays),
    leadAir: median(leadAirDays),
    leadSea: median(leadSeaDays),
    fillRate: orderedSum > 0 ? firstReceivedSum / orderedSum : null,
    outstandingOrderRate: totalOrders > 0 ? outstandingOrders / totalOrders : null,
    avgAging: agingOutstanding.length > 0 ? agingOutstanding.reduce((s, x) => s + x, 0) / agingOutstanding.length : null,
    inTransitValue,
    stageCounts,
    agingBuckets,
  };
}

function pct(x: number | null): string {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`;
}
function num(x: number | null): string {
  return x == null ? '—' : x.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}
function money(x: number): string {
  return x.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
}

interface CardProps {
  label: string;
  value: string;
  target?: string;
}
function Card({ label, value, target }: CardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {target && <div className="mt-1 text-xs text-slate-400">Mục tiêu (đề xuất): {target}</div>}
    </div>
  );
}

interface BarRow {
  label: string;
  value: number;
}
function BarChart({ rows, unit }: { rows: BarRow[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <div className="w-28 shrink-0 truncate text-xs text-slate-600" title={r.label}>
            {r.label}
          </div>
          <div className="h-4 flex-1 rounded bg-slate-100">
            <div
              className="h-4 rounded bg-indigo-500"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <div className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-700">
            {num(r.value)}
            {unit ? ` ${unit}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

export default function ExecutionDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const orders = await listSupplierOrders();
        const loaded: LoadedOrder[] = await Promise.all(
          orders.map(async (order) => {
            const lines = await listOrderLines(order.id);
            const withLots = await Promise.all(
              lines.map(async (line) => ({ line, lots: await listReceiptLots(line.id) })),
            );
            return { order, lines: withLots };
          }),
        );
        if (cancelled) return;
        setKpis(computeKpis(loaded));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu thực thi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-slate-500">Đang tải dữ liệu…</div>;
  }
  if (error) {
    return (
      <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Không tải được dữ liệu: {error}
      </div>
    );
  }
  if (!kpis) return null;

  const leadByMethod: BarRow[] = [
    { label: 'AIR', value: kpis.leadAir ?? 0 },
    { label: 'SEA', value: kpis.leadSea ?? 0 },
  ];
  const stageRows: BarRow[] = STAGE_ORDER.map((s) => ({
    label: STAGE_LABELS[s],
    value: kpis.stageCounts[s],
  }));
  const agingRows: BarRow[] = (['0-15', '16-30', '31-60', '>60'] as const).map((k) => ({
    label: `${k} ngày`,
    value: kpis.agingBuckets[k],
  }));

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-slate-900">Bảng điều khiển thực thi đơn hàng</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Tỉ lệ đúng hẹn" value={pct(kpis.onTimeRate)} target="≥ 90%" />
        <Card label="Lead-time trung vị (ngày)" value={num(kpis.leadAll)} />
        <Card label="Fill-rate đợt đầu" value={pct(kpis.fillRate)} target="≥ 85%" />
        <Card label="Tỉ lệ đơn còn nợ" value={pct(kpis.outstandingOrderRate)} target="≤ 10%" />
        <Card label="Tuổi nợ TB (ngày)" value={num(kpis.avgAging)} target="≤ 30" />
        <Card label="Giá trị đang về" value={money(kpis.inTransitValue)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Lead-time theo phương thức (ngày)">
          <BarChart rows={leadByMethod} unit="ngày" />
        </Section>
        <Section title="Tuổi nợ theo nhóm (số đơn)">
          <BarChart rows={agingRows} />
        </Section>
        <Section title="Phân bố trạng thái (số đơn)">
          <BarChart rows={stageRows} />
        </Section>
      </div>
    </div>
  );
}
