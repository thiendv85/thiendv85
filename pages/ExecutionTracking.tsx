import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useExecutionTracking } from '../hooks/useExecutionTracking';
import { STAGE_ORDER, type ExecStage } from '../types/execution';

const STAGE_LABEL: Record<ExecStage, string> = {
  S0_PENDING_SPLIT: 'Chờ tách',
  S1_SPLIT: 'Đã tách',
  S2_ORDERED: 'Đã đặt NCC',
  S3_SUPPLIER_CONFIRMED: 'NCC xác nhận',
  S4_INVOICED: 'Có invoice',
  S5_ETD: 'Đã ETD',
  S6_ETA: 'Đến VN (ETA)',
  S7_CUSTOMS: 'Thông quan',
  S8_RECEIVED: 'Về kho',
  S9_DONE: 'Hoàn tất',
};

export default function ExecutionTracking() {
  const { orders, loading, error } = useExecutionTracking();
  const [stageFilter, setStageFilter] = useState<ExecStage | 'OPEN' | 'ALL'>('OPEN');
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    if (stageFilter === 'ALL') return orders;
    if (stageFilter === 'OPEN') return orders.filter((o) => o.stage !== 'S9_DONE');
    return orders.filter((o) => o.stage === stageFilter);
  }, [orders, stageFilter]);

  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });

  if (loading) return <div className="p-6">Đang tải…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Theo dõi thực thi đơn hàng &amp; hàng về</h1>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <button onClick={() => setStageFilter('OPEN')} className="px-2 py-1 border rounded">
          Đang chạy
        </button>
        <button onClick={() => setStageFilter('ALL')} className="px-2 py-1 border rounded">
          Tất cả
        </button>
        {STAGE_ORDER.map((s) => (
          <button key={s} onClick={() => setStageFilter(s)} className="px-2 py-1 border rounded">
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
      <div ref={parentRef} className="h-[70vh] overflow-auto border rounded">
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((vi) => {
            const o = rows[vi.index];
            return (
              <div
                key={o.id}
                style={{ position: 'absolute', top: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
                className="flex gap-3 px-3 py-2 border-b text-sm"
              >
                <span className="w-40 truncate">{o.po_region_no}</span>
                <span className="w-40 truncate">{o.supplier}</span>
                <span className="w-44 truncate">{o.external_order_ref ?? '—'}</span>
                <span className="w-32">{STAGE_LABEL[o.stage]}</span>
                <span className="w-20">{o.ship_method ?? ''}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">{rows.length} đơn NCC</p>
    </div>
  );
}
