import { useMemo, useState } from 'react';
import { useExecutionTracking } from '../hooks/useExecutionTracking';
import { STAGE_ORDER, type SupplierOrder } from '../types/execution';
import ExecutionToolbar, { type ExecFilters, type StageFilter } from '../components/execution/ExecutionToolbar';
import PipelineTable from '../components/execution/PipelineTable';
import ExecutionOrderDetail from '../components/ExecutionOrderDetail';
import ExecutionSplitModal from '../components/ExecutionSplitModal';
import ExecutionDashboard from '../components/execution/ExecutionDashboard';
import ImportWizard from '../components/execution/ImportWizard';

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

export default function ExecutionTracking() {
  const { orders, summaries, loading, error, reload } = useExecutionTracking();
  const [tab, setTab] = useState<'pipeline' | 'dashboard' | 'import'>('pipeline');
  const [filters, setFilters] = useState<ExecFilters>({ stage: 'OPEN', supplier: 'ALL', method: 'ALL', region: 'ALL', q: '' });
  const [selected, setSelected] = useState<SupplierOrder | null>(null);
  const [splitId, setSplitId] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);

  const suppliers = useMemo(() => uniq(orders.map((o) => o.supplier)), [orders]);
  const regions = useMemo(() => uniq(orders.map((o) => o.region)), [orders]);

  // Lọc theo NCC/PT/miền/search (chưa áp filter trạng thái — để đếm chip).
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

  // Áp filter trạng thái (sort do TanStack Table trong PipelineTable lo).
  const rows = useMemo(() => {
    if (filters.stage === 'OPEN') return base.filter((o) => o.stage !== 'S9_DONE');
    if (filters.stage === 'ALL') return base;
    return base.filter((o) => o.stage === filters.stage);
  }, [base, filters.stage]);

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
      {tab === 'pipeline' &&
        (loading ? (
          <div className="p-6">Đang tải…</div>
        ) : error ? (
          <div className="p-6 text-red-600">{error}</div>
        ) : (
          <>
            <ExecutionToolbar filters={filters} onChange={setFilters} suppliers={suppliers} regions={regions} stageCounts={stageCounts} />
            <PipelineTable data={rows} summaries={summaries} onRowClick={setSelected} />
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
