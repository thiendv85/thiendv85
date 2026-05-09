'use client';
import React, { useMemo, useState } from 'react';
import { useData } from './DataProvider';
import { computeScorecard, reliabilityScore } from '@/lib/scorecard';

const WINDOWS = [
  { label: '7 ngày', value: 7 },
  { label: '30 ngày', value: 30 },
  { label: '90 ngày', value: 90 },
  { label: 'Tất cả', value: 'all' as const },
];

export default function SupplierScorecard() {
  const { archive } = useData();
  const [window, setWindow] = useState<number | 'all'>(30);
  const [drilldown, setDrilldown] = useState<string | null>(null);

  const stats = useMemo(() => computeScorecard(archive, { windowDays: window }), [archive, window]);

  if (archive.length === 0) {
    return <p className="p-6 text-sm text-slate-500 italic">Chưa có lần nhắc nào để hiển thị scorecard.</p>;
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex gap-2 mb-3">
        {WINDOWS.map(w => (
          <button
            key={w.label}
            onClick={() => setWindow(w.value)}
            className={`px-3 py-1 rounded text-sm font-semibold ${window === w.value ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">NCC</th>
            <th className="text-right p-2">#đơn</th>
            <th className="text-right p-2">#nhắc</th>
            <th className="text-right p-2">%commit</th>
            <th className="text-right p-2">%silent</th>
            <th className="text-right p-2">Avg slip</th>
            <th className="text-right p-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {stats.map(s => (
            <tr
              key={s.supplier}
              data-testid="supplier-row"
              className="border-b hover:bg-slate-50 cursor-pointer"
              onClick={() => setDrilldown(s.supplier)}
            >
              <td className="p-2 font-semibold">{s.supplier}</td>
              <td className="p-2 text-right">{s.totalOrders}</td>
              <td className="p-2 text-right">{s.totalReminders}</td>
              <td className="p-2 text-right">{(s.pctCommitted * 100).toFixed(0)}%</td>
              <td className="p-2 text-right">{(s.pctSilent * 100).toFixed(0)}%</td>
              <td className="p-2 text-right">{s.avgEtaSlipDays.toFixed(0)}d</td>
              <td className="p-2 text-right font-bold">{reliabilityScore(s).toFixed(1)}/10</td>
            </tr>
          ))}
        </tbody>
      </table>

      {drilldown && <SupplierDrilldown supplier={drilldown} onClose={() => setDrilldown(null)} />}
    </div>
  );
}

function SupplierDrilldown({ supplier, onClose }: { supplier: string; onClose: () => void }) {
  const { archive } = useData();
  const reminders = archive.filter(r => r.supplier === supplier);
  return (
    <div role="dialog" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-bold">{supplier}</h2>
          <button onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <ul className="text-sm space-y-1">
          {reminders.map(r => (
            <li key={r.uuid} className="border-b py-1">
              {r.doc_no} · {r.item_name} · {r.ncc_response_status} · {new Date(r.created_at).toLocaleDateString('vi-VN')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
