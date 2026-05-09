'use client';
import React, { useMemo } from 'react';
import { useData } from './DataProvider';

export default function ReminderHistoryTable({ docNo, itemCode, rowId }: { docNo: string; itemCode: string; rowId?: string }) {
  const { archive } = useData();
  const filtered = useMemo(
    () => archive
      .filter(r => r.doc_no === docNo && r.item_code === itemCode && (!rowId || r.row_id === rowId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [archive, docNo, itemCode, rowId]
  );

  if (filtered.length === 0) return <p className="text-sm text-slate-500 italic">Chưa có lần nhắc nào.</p>;

  return (
    <table className="w-full text-xs">
      <thead className="bg-slate-100">
        <tr>
          <th className="text-left p-1">Khi nào</th>
          <th className="text-left p-1">NV</th>
          <th className="text-left p-1">Kênh</th>
          <th className="text-left p-1">Mức</th>
          <th className="text-left p-1">Status</th>
          <th className="text-left p-1">NCC trả lời</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(r => (
          <tr key={r.uuid} data-testid="history-row" className="border-b">
            <td className="p-1">{new Date(r.created_at).toLocaleString('vi-VN')}</td>
            <td className="p-1">{r.reminder_by}</td>
            <td className="p-1">{r.channel}</td>
            <td className="p-1">{r.template_used}</td>
            <td className="p-1">{r.ncc_response_status}</td>
            <td className="p-1">{r.ncc_response ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
