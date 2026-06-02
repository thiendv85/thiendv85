import { useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { STAGE_ORDER, type SupplierOrder } from '../../types/execution';
import type { OrderSummary } from '../../utils/supabase/execution';
import StageBadge from './StageBadge';

interface Props {
  data: SupplierOrder[];
  summaries: Map<string, OrderSummary>;
  onRowClick: (o: SupplierOrder) => void;
}

const col = createColumnHelper<SupplierOrder>();

export default function PipelineTable({ data, summaries, onRowClick }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'stage', desc: false }]);
  const parentRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => [
      col.accessor('po_region_no', { id: 'po', header: 'Số PO', size: 170, cell: (c) => c.getValue() ?? '—' }),
      col.accessor('supplier', { id: 'supplier', header: 'NCC', size: 150 }),
      col.accessor((r) => r.external_order_ref, {
        id: 'ext_ref', header: 'Khoá NCC', size: 140,
        cell: (c) => <span className="text-slate-500">{c.getValue() ?? '—'}</span>,
      }),
      col.accessor('stage', {
        id: 'stage', header: 'Trạng thái', size: 130,
        sortingFn: (a, b) => STAGE_ORDER.indexOf(a.original.stage) - STAGE_ORDER.indexOf(b.original.stage),
        cell: (c) => <StageBadge stage={c.getValue()} />,
      }),
      col.accessor('ship_method', {
        id: 'method', header: 'PT', size: 64,
        cell: (c) => {
          const m = c.getValue();
          return (
            <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${m === 'AIR' ? 'bg-sky-100 text-sky-700' : 'bg-cyan-100 text-cyan-700'}`}>
              {m ?? '—'}
            </span>
          );
        },
      }),
      col.accessor((r) => summaries.get(r.id)?.eta ?? null, {
        id: 'eta', header: 'ETA', size: 100,
        cell: (c) => <span className="text-slate-600">{c.getValue() ?? '—'}</span>,
      }),
      col.accessor((r) => summaries.get(r.id)?.outstanding ?? null, {
        id: 'outstanding', header: 'Tồn nợ', size: 90,
        cell: (c) => {
          const v = c.getValue();
          return <span className={`font-semibold ${v && v > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{v == null ? '—' : v}</span>;
        },
      }),
      col.accessor((r) => summaries.get(r.id)?.agingDays ?? null, {
        id: 'aging', header: 'Tuổi nợ', size: 80,
        cell: (c) => <span className="text-slate-600">{c.getValue() == null ? '—' : `${c.getValue()}n`}</span>,
      }),
      col.display({
        id: 'late', header: '', size: 44, enableSorting: false,
        cell: (c) =>
          summaries.get(c.row.original.id)?.isLate ? (
            <i className="fas fa-triangle-exclamation text-rose-500" title="Trễ so dự kiến" />
          ) : null,
      }),
    ],
    [summaries],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 44, overscan: 12 });

  return (
    <div className="mt-3 border rounded overflow-hidden">
      <div className="overflow-x-auto">
        {/* Header */}
        <div className="flex bg-slate-100 border-b text-xs font-bold text-slate-600 select-none min-w-max">
          {table.getHeaderGroups().map((hg) =>
            hg.headers.map((h) => (
              <div
                key={h.id}
                style={{ width: h.getSize() }}
                onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                className={`px-3 py-2 truncate ${h.column.getCanSort() ? 'cursor-pointer hover:text-slate-900' : ''}`}
              >
                {flexRender(h.column.columnDef.header, h.getContext())}
                {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
              </div>
            )),
          )}
        </div>
        {/* Body virtualize */}
        <div ref={parentRef} className="h-[66vh] overflow-y-auto min-w-max">
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              return (
                <div
                  key={row.id}
                  onClick={() => onRowClick(row.original)}
                  style={{ position: 'absolute', top: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
                  className="flex border-b text-sm cursor-pointer hover:bg-blue-50 items-center"
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} style={{ width: cell.column.getSize() }} className="px-3 py-2.5 truncate">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="px-3 py-2 text-xs text-gray-500 border-t bg-slate-50">{rows.length} đơn NCC</p>
    </div>
  );
}
