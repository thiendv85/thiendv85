import { useMemo } from 'react';
import type { SupplierOrder } from '../../types/execution';
import type { OrderSummary } from '../../utils/supabase/execution';
import { STAGE_LABEL } from './stageMeta';

interface Props {
  orders: SupplierOrder[];
  summaries: Map<string, OrderSummary>;
  onSelect?: (o: SupplierOrder) => void;
}

type AlertKind = 'late' | 'outstanding' | 'unconfirmed';

interface AlertMeta {
  label: string;
  icon: string;
  card: string; // màu card
  badge: string; // màu badge trong list
}

const META: Record<AlertKind, AlertMeta> = {
  late: {
    label: 'Trễ',
    icon: 'fa-triangle-exclamation',
    card: 'bg-rose-50 border-rose-200 text-rose-700',
    badge: 'bg-rose-100 text-rose-700',
  },
  outstanding: {
    label: 'Tồn nợ quá hạn',
    icon: 'fa-clock-rotate-left',
    card: 'bg-amber-50 border-amber-200 text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
  },
  unconfirmed: {
    label: 'NCC chưa xác nhận quá hạn',
    icon: 'fa-circle-question',
    card: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    badge: 'bg-indigo-100 text-indigo-700',
  },
};

// Ưu tiên trễ khi dedup theo id.
const PRIORITY: AlertKind[] = ['late', 'outstanding', 'unconfirmed'];
const MAX_ROWS = 8;

export default function AlertsPanel({ orders, summaries, onSelect }: Props) {
  const { counts, list } = useMemo(() => {
    const counts: Record<AlertKind, number> = { late: 0, outstanding: 0, unconfirmed: 0 };
    const kindsById = new Map<string, { o: SupplierOrder; kinds: Set<AlertKind> }>();

    for (const o of orders) {
      const s = summaries.get(o.id);
      const hits: AlertKind[] = [];
      if (s?.isLate === true) hits.push('late');
      if (s && s.outstanding > 0 && (s.agingDays ?? 0) > 30) hits.push('outstanding');
      if (o.stage === 'S2_ORDERED' && !o.supplier_confirmed_at && (s?.agingDays ?? 0) > 2) {
        hits.push('unconfirmed');
      }
      if (hits.length === 0) continue;
      for (const k of hits) counts[k] += 1;
      kindsById.set(o.id, { o, kinds: new Set(hits) });
    }

    // dedup theo id; sắp theo ưu tiên (trễ trước)
    const list = [...kindsById.values()].sort((a, b) => rank(a.kinds) - rank(b.kinds));
    return { counts, list };
  }, [orders, summaries]);

  const total = counts.late + counts.outstanding + counts.unconfirmed;

  if (total === 0) {
    return (
      <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
        <i className="fas fa-check-circle mr-1.5 text-emerald-400" />
        Không có cảnh báo
      </div>
    );
  }

  return (
    <div className="mt-3">
      {/* Hàng 3 thẻ đếm */}
      <div className="grid grid-cols-3 gap-2">
        {PRIORITY.map((k) => (
          <div key={k} className={`flex items-center gap-2 rounded border px-3 py-2 ${META[k].card}`}>
            <i className={`fas ${META[k].icon} text-base`} />
            <div className="min-w-0">
              <div className="truncate text-2xs font-semibold uppercase tracking-wide opacity-80">{META[k].label}</div>
              <div className="text-lg font-bold leading-none">{counts[k]}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Danh sách gộp (tối đa ~8 đơn) */}
      <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200 bg-white">
        {list.slice(0, MAX_ROWS).map(({ o, kinds }) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onSelect?.(o)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-blue-50"
            >
              <span className="font-semibold text-slate-700">{o.po_region_no ?? '—'}</span>
              <span className="text-slate-400">·</span>
              <span className="truncate text-slate-600">{o.supplier}</span>
              <span className="text-slate-400">·</span>
              <span className="truncate text-slate-500">{STAGE_LABEL[o.stage]}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {PRIORITY.filter((k) => kinds.has(k)).map((k) => (
                  <span key={k} className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${META[k].badge}`}>
                    {META[k].label}
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.length > MAX_ROWS && (
        <p className="mt-1 px-1 text-2xs text-slate-400">+{list.length - MAX_ROWS} đơn khác có cảnh báo</p>
      )}
    </div>
  );
}

// Hạng ưu tiên của 1 đơn = vị trí nhóm ưu tiên cao nhất nó dính (nhỏ = ưu tiên hơn).
function rank(kinds: Set<AlertKind>): number {
  for (let i = 0; i < PRIORITY.length; i += 1) {
    if (kinds.has(PRIORITY[i])) return i;
  }
  return PRIORITY.length;
}
