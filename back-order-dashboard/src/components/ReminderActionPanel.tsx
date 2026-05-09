'use client';
import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { TransformedBOData } from '@/lib/transform';
import { useData } from './DataProvider';
import { compositeKey, type TemplateLevel, type ReminderChannel } from '@/lib/types';
import { renderTemplate, suggestTemplateLevel } from '@/lib/templates';
import TemplateGenerator from './TemplateGenerator';
import ReminderLogModal from './ReminderLogModal';

const LEVELS: TemplateLevel[] = ['first-nudge', 'overdue', 'escalation'];

export default function ReminderActionPanel({ row, onClose }: { row: TransformedBOData; onClose: () => void }) {
  const { annotations } = useData();
  const ann = annotations.get(compositeKey(row.DocNo, row.ItemCode, row.RowId));
  const isOverdue = row.DaysUntilETA !== null && row.DaysUntilETA < 0;
  const [level, setLevel] = useState<TemplateLevel>(() => suggestTemplateLevel(ann, isOverdue));
  const [logOpen, setLogOpen] = useState(false);
  const [channel] = useState<ReminderChannel>('email');

  const ctx = {
    doc_no: row.DocNo,
    item_code: row.ItemCode,
    item_name: row.ItemName,
    supplier: row['SR-ĐL2'] ?? '(chưa rõ)',
    doc_date: row.DocDate,
    aging_days: row.AgingDays,
    estimated_date1: row.EstimatedDate1,
    days_overdue: isOverdue && row.DaysUntilETA !== null ? -row.DaysUntilETA : 0,
    reminder_count: ann?.reminder_count ?? 0,
  };

  const renderedEmail = useMemo(() => renderTemplate(level, 'email', ctx), [level, ctx]);
  const renderedZalo = useMemo(() => renderTemplate(level, 'zalo', ctx), [level, ctx]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <div className="font-bold text-lg">{row.DocNo}</div>
            <div className="text-sm text-slate-600">{row.ItemName} · {row['SR-ĐL2']}</div>
          </div>
          <button onClick={onClose} aria-label="Đóng"><X /></button>
        </div>

        <div className="px-4 py-3 border-b bg-slate-50 flex gap-4 text-sm flex-wrap">
          <span><strong>Aging:</strong> {row.AgingDays}d</span>
          <span><strong>ETA cũ:</strong> {row.EstimatedDate1 ?? '(chưa có)'}</span>
          <span><strong>Đã nhắc:</strong> {ann?.reminder_count ?? 0}</span>
        </div>

        <div className="px-4 py-3">
          <div className="flex gap-2 mb-3 flex-wrap">
            {LEVELS.map(l => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`px-3 py-1 rounded text-sm font-semibold ${level === l ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <TemplateGenerator rendered={renderedEmail} />
            <details>
              <summary className="cursor-pointer text-sm text-slate-500">Phiên bản Zalo</summary>
              <div className="mt-2"><TemplateGenerator rendered={renderedZalo} /></div>
            </details>
          </div>
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button
            onClick={() => setLogOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold"
          >
            Đã gửi, ghi log
          </button>
        </div>

        {logOpen && (
          <ReminderLogModal
            row={row}
            level={level}
            channel={channel}
            onClose={() => setLogOpen(false)}
            onSaved={() => { setLogOpen(false); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}
