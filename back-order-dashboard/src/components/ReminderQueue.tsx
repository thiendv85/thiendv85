'use client';
import React, { useMemo, useState } from 'react';
import { useData } from './DataProvider';
import { sortByPriority } from '@/lib/priority';
import { compositeKey } from '@/lib/types';
import EmptyState from './EmptyState';
import ReminderActionPanel from './ReminderActionPanel';
import type { TransformedBOData } from '@/lib/transform';

const CATEGORY_COLOR: Record<string, string> = {
  'Khẩn VOR': 'bg-red-600 text-white',
  'Khẩn': 'bg-red-500 text-white',
  'Bảo hành': 'bg-orange-500 text-white',
  'Dự trữ': 'bg-yellow-400 text-slate-900',
};
const DEFAULT_COLOR = 'bg-slate-300 text-slate-900';

export default function ReminderQueue() {
  const { data, annotations } = useData();
  const [openItem, setOpenItem] = useState<TransformedBOData | null>(null);

  const sorted = useMemo(
    () => sortByPriority(data, { annotations, today: new Date() }),
    [data, annotations]
  );

  if (data.length === 0) return <div className="p-6"><EmptyState /></div>;

  return (
    <div className="p-4 space-y-3 max-w-5xl mx-auto">
      {sorted.map((row, idx) => {
        const key = compositeKey(row.DocNo, row.ItemCode, row.RowId);
        const ann = annotations.get(key);
        const cat = row.OPropertyName;
        const color = CATEGORY_COLOR[cat] ?? DEFAULT_COLOR;
        return (
          <div
            key={`${key}-${idx}`}
            data-testid="reminder-card"
            className="border border-slate-200 rounded-md p-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setOpenItem(row)}
          >
            <span className="text-slate-400 font-bold text-sm w-8">#{idx + 1}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase whitespace-nowrap ${color}`}>{cat || 'Khác'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate" data-testid="doc-no">{row.DocNo}</div>
              <div className="text-xs text-slate-600 truncate">
                {row.ItemName} · NCC: {row['SR-ĐL2']} · Aging {row.AgingDays}d
                {ann ? ` · Đã nhắc ${ann.reminder_count}` : ' · Chưa nhắc'}
              </div>
            </div>
            <button className="text-blue-600 text-sm font-semibold whitespace-nowrap">Mở để thúc →</button>
          </div>
        );
      })}

      {openItem && (
        <ReminderActionPanel row={openItem} onClose={() => setOpenItem(null)} />
      )}
    </div>
  );
}
