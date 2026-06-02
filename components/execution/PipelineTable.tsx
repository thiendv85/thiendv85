import { useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { STAGE_ORDER, type SupplierOrder } from '../../types/execution';
import type { OrderSummary } from '../../utils/supabase/execution';
import StageBadge from './StageBadge';
import { STAGE_LABEL } from './stageMeta';
import { downloadCsv, downloadXlsx } from '../../utils/execution/exportTable';

interface Props {
  data: SupplierOrder[];
  summaries: Map<string, OrderSummary>;
  onRowClick: (o: SupplierOrder) => void;
}

const col = createColumnHelper<SupplierOrder>();

const COL_LABEL: Record<string, string> = {
  po: 'Số PO', supplier: 'NCC', ext_ref: 'Khoá NCC', stage: 'Trạng thái',
  method: 'PT', eta: 'ETA', outstanding: 'Tồn nợ', aging: 'Tuổi nợ', late: 'Trễ',
};

export default function PipelineTable({ data, summaries, onRowClick }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'stage', desc: false }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showColMenu, setShowColMenu] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => [
      col.display({
        id: 'select', size: 36, enableSorting: false, enableHiding: false,
        header: ({ table }) => (
          <input type="checkbox" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />
        ),
        cell: ({ row }) => (
          <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} onClick={(e) => e.stopPropagation()} />
        ),
      }),
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
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (o) => o.id,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 44, overscan: 12 });
  const selectedCount = table.getSelectedRowModel().rows.length;

  function handleExport(fmt: 'csv' | 'xlsx') {
    const sel = table.getSelectedRowModel().rows;
    const src = (sel.length ? sel : table.getSortedRowModel().rows).map((r) => r.original);
    const headers = ['Số PO', 'NCC', 'Khoá NCC', 'Trạng thái', 'PT', 'ETA', 'Tồn nợ', 'Tuổi nợ', 'Trễ'];
    const out: (string | number | null)[][] = src.map((o) => {
      const s = summaries.get(o.id);
      return [
        o.po_region_no, o.supplier, o.external_order_ref, STAGE_LABEL[o.stage], o.ship_method,
        s?.eta ?? null, s?.outstanding ?? null, s?.agingDays ?? null, s?.isLate ? 'TRỄ' : '',
      ];
    });
    const name = `hang-ve-${new Date().toISOString().slice(0, 10)}`;
    if (fmt === 'csv') downloadCsv(`${name}.csv`, headers, out);
    else void downloadXlsx(`${name}.xlsx`, headers, out);
  }

  return (
    <div className="mt-3">
      {/* Thanh công cụ bảng */}
      <div className="flex items-center gap-2 mb-2 text-sm">
        <div className="relative">
          <button onClick={() => setShowColMenu((s) => !s)} className="px-3 py-1 border rounded hover:bg-slate-50">
            Cột ▾
          </button>
          {showColMenu && (
            <div className="absolute z-20 mt-1 bg-white border rounded shadow-lg p-2 w-44 max-h-72 overflow-auto">
              {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer">
                  <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                  <span>{COL_LABEL[c.id] ?? c.id}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => handleExport('csv')} className="px-3 py-1 border rounded hover:bg-slate-50">
          <i className="fas fa-file-csv mr-1" /> CSV
        </button>
        <button onClick={() => handleExport('xlsx')} className="px-3 py-1 border rounded hover:bg-slate-50">
          <i className="fas fa-file-excel mr-1 text-emerald-600" /> Excel
        </button>
        {selectedCount > 0 && <span className="text-xs text-slate-500">Đã chọn {selectedCount} (xuất theo chọn)</span>}
      </div>

      <div className="border rounded overflow-hidden">
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="flex bg-slate-100 border-b text-xs font-bold text-slate-600 select-none min-w-max">
            {table.getHeaderGroups().map((hg) =>
              hg.headers.map((h) => (
                <div key={h.id} style={{ width: h.getSize() }} className="relative px-3 py-2 truncate">
                  <span
                    onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                    className={h.column.getCanSort() ? 'cursor-pointer hover:text-slate-900' : ''}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                  </span>
                  {h.column.getCanResize() && (
                    <div
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-blue-400/60"
                    />
                  )}
                </div>
              )),
            )}
          </div>
          {/* Body virtualize */}
          <div ref={parentRef} className="h-[64vh] overflow-y-auto min-w-max">
            <div style={{ height: v.getTotalSize(), position: 'relative' }}>
              {v.getVirtualItems().map((vi) => {
                const row = rows[vi.index];
                return (
                  <div
                    key={row.id}
                    onClick={() => onRowClick(row.original)}
                    style={{ position: 'absolute', top: 0, transform: `translateY(${vi.start}px)`, width: '100%' }}
                    className={`flex border-b text-sm cursor-pointer hover:bg-blue-50 items-center ${row.getIsSelected() ? 'bg-blue-50/60' : ''}`}
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
    </div>
  );
}
