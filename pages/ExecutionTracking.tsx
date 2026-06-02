import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useExecutionTracking } from '../hooks/useExecutionTracking';
import { STAGE_ORDER, type SupplierOrder } from '../types/execution';
import StageBadge from '../components/execution/StageBadge';
import ExecutionToolbar, { type ExecFilters, type StageFilter } from '../components/execution/ExecutionToolbar';
import ExecutionOrderDetail from '../components/ExecutionOrderDetail';
import ExecutionSplitModal from '../components/ExecutionSplitModal';
import ExecutionDashboard from '../components/execution/ExecutionDashboard';
import ImportWizard from '../components/execution/ImportWizard';

type SortKey = 'po' | 'supplier' | 'stage' | 'eta' | 'outstanding' | 'aging';
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

export default function ExecutionTracking() {
  const { orders, summaries, loading, error, reload } = useExecutionTracking();
  const [tab, setTab] = useState<'pipeline' | 'dashboard' | 'import'>('pipeline');
  const [filters, setFilters] = useState<ExecFilters>({ stage: 'OPEN', supplier: 'ALL', method: 'ALL', region: 'ALL', q: '' });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'stage', dir: 1 });
  const [selected, setSelected] = useState<SupplierOrder | null>(null);
  const [splitId, setSplitId] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const suppliers = useMemo(() => uniq(orders.map((o) => o.supplier)), [orders]);
  const regions = useMemo(() => uniq(orders.map((o) => o.region)), [orders]);

  // Lọc theo NCC/PT/miền/search (CHƯA áp filter trạng thái — để đếm chip).
  const base = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return orders.filter((o) => {
      if (filters.supplier !== 'ALL' && o.supplier !== filters.supplier) return false;
      if (filters.method !== 'ALL' && o.ship_method !== filters.method) return false;
      if (filters.region !== 'ALL' && o.region !== filters.region) return false;
      if (q) {
        const hay = `${o.po_region_no ?? ''} ${o.external_order_ref ?? ''} ${o.supplier}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filters.supplier, filters.method, filters.region, filters.q]);

  const stageCounts = useMemo(() => {
    const c = { OPEN: 0, ALL: base.length } as Record<StageFilter, number>;
    c.OPEN = base.filter((o) => o.stage !== 'S9_DONE').length;
    for (const s of STAGE_ORDER) c[s] = base.filter((o) => o.stage === s).length;
    return c;
  }, [base]);

  const rows = useMemo(() => {
    let r = base;
    if (filters.stage === 'OPEN') r = r.filter((o) => o.stage !== 'S9_DONE');
    else if (filters.stage !== 'ALL') r = r.filter((o) => o.stage === filters.stage);

    const val = (o: SupplierOrder): string | number => {
      const s = summaries.get(o.id);
      switch (sort.key) {
        case 'po': return o.po_region_no ?? '';
        case 'supplier': return o.supplier;
        case 'stage': return STAGE_ORDER.indexOf(o.stage);
        case 'eta': return s?.eta ?? '￿';
        case 'outstanding': return s?.outstanding ?? -1;
        case 'aging': return s?.agingDays ?? -1;
      }
    };
    return [...r].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [base, filters.stage, sort, summaries]);

  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 44, overscan: 12 });

  const toggleSort = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: (p.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));

  const COLS: { key?: SortKey; label: string; w: string; cls?: string }[] = [
    { key: 'po', label: 'Số PO', w: 'w-40' },
    { key: 'supplier', label: 'NCC', w: 'w-36' },
    { label: 'Khoá NCC', w: 'w-32' },
    { key: 'stage', label: 'Trạng thái', w: 'w-32' },
    { label: 'PT', w: 'w-14' },
    { key: 'eta', label: 'ETA', w: 'w-24' },
    { key: 'outstanding', label: 'Tồn nợ', w: 'w-20', cls: 'text-right' },
    { key: 'aging', label: 'Tuổi nợ', w: 'w-20', cls: 'text-right' },
    { label: '', w: 'w-10' },
  ];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Theo dõi thực thi đơn hàng &amp; hàng về</h1>
        <div className="flex items-center gap-2 text-sm">
          <input
            value={splitId}
            onChange={(e) => setSplitId(e.target.value)}
            placeholder="ID đơn duyệt V16…"
            className="px-2 py-1 border rounded w-44"
          />
          <button
            onClick={() => splitId.trim() && setSplitOpen(true)}
            disabled={!splitId.trim()}
            className="px-3 py-1 border rounded bg-blue-600 text-white disabled:opacity-40"
          >
            Tách &amp; gán NCC
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-3 text-sm border-b">
        {([['pipeline', 'Pipeline'], ['dashboard', 'Dashboard & KPI'], ['import', 'Nhập từ NCC']] as const).map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px border-b-2 ${tab === k ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <ExecutionDashboard />}
      {tab === 'import' && <ImportWizard />}
      {tab === 'pipeline' && (loading ? (
        <div className="p-6">Đang tải…</div>
      ) : error ? (
        <div className="p-6 text-red-600">{error}</div>
      ) : (
        <>
      <ExecutionToolbar filters={filters} onChange={setFilters} suppliers={suppliers} regions={regions} stageCounts={stageCounts} />

      <div className="mt-3 border rounded overflow-hidden">
        {/* Header dính */}
        <div className="flex gap-3 px-3 py-2 bg-slate-100 border-b text-xs font-bold text-slate-600 select-none">
          {COLS.map((c, i) => (
            <span
              key={i}
              className={`${c.w} ${c.cls ?? ''} ${c.key ? 'cursor-pointer hover:text-slate-900' : ''} truncate`}
              onClick={c.key ? () => toggleSort(c.key!) : undefined}
            >
              {c.label}
              {c.key && sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
            </span>
          ))}
        </div>
        <div ref={parentRef} className="h-[68vh] overflow-auto">
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map((vi) => {
              const o = rows[vi.index];
              const s = summaries.get(o.id);
              return (
                <div
                  key={o.id}
                  onClick={() => setSelected(o)}
                  style={{ position: 'absolute', top: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
                  className="flex gap-3 px-3 py-2.5 border-b text-sm cursor-pointer hover:bg-blue-50 items-center"
                >
                  <span className="w-40 truncate">{o.po_region_no}</span>
                  <span className="w-36 truncate">{o.supplier}</span>
                  <span className="w-32 truncate text-slate-500">{o.external_order_ref ?? '—'}</span>
                  <span className="w-32"><StageBadge stage={o.stage} /></span>
                  <span className="w-14">
                    <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${o.ship_method === 'AIR' ? 'bg-sky-100 text-sky-700' : 'bg-cyan-100 text-cyan-700'}`}>
                      {o.ship_method ?? '—'}
                    </span>
                  </span>
                  <span className="w-24 text-slate-600">{s?.eta ?? '—'}</span>
                  <span className={`w-20 text-right font-semibold ${s && s.outstanding > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {s ? s.outstanding : '—'}
                  </span>
                  <span className="w-20 text-right text-slate-600">{s?.agingDays != null ? `${s.agingDays}n` : '—'}</span>
                  <span className="w-10 text-center">
                    {s?.isLate ? <i className="fas fa-triangle-exclamation text-rose-500" title="Trễ so dự kiến" /> : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">{rows.length} đơn NCC</p>
        </>
      ))}

      {selected && <ExecutionOrderDetail order={selected} onClose={() => setSelected(null)} onChange={reload} />}
      {splitOpen && (
        <ExecutionSplitModal
          approvalId={splitId.trim()}
          onClose={() => setSplitOpen(false)}
          onDone={() => {
            setSplitId('');
            reload();
          }}
        />
      )}
    </div>
  );
}
