'use client';
import React, { useState } from 'react';
import type { TransformedBOData } from '@/lib/transform';
import { useData } from './DataProvider';
import type { TemplateLevel, ReminderChannel, ReminderStatus } from '@/lib/types';

const STATUSES: ReminderStatus[] = ['pending', 'acknowledged', 'committed', 'silent', 'closed'];
const CHANNELS: ReminderChannel[] = ['email', 'zalo', 'phone'];

export default function ReminderLogModal({
  row, level, channel: defaultChannel, onClose, onSaved,
}: {
  row: TransformedBOData; level: TemplateLevel; channel: ReminderChannel;
  onClose: () => void; onSaved: () => void;
}) {
  const { logReminder } = useData();
  const [channel, setChannel] = useState<ReminderChannel | ''>(defaultChannel);
  const [status, setStatus] = useState<ReminderStatus | ''>('');
  const [response, setResponse] = useState('');
  const [eta, setEta] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSave = channel !== '' && status !== '' && !submitting;

  const handleSave = () => {
    if (!canSave) return;
    setSubmitting(true);
    logReminder({
      doc_no: row.DocNo,
      item_code: row.ItemCode,
      row_id: row.RowId,
      item_name: row.ItemName,
      supplier: row['SR-ĐL2'] ?? '',
      channel: channel as ReminderChannel,
      template_used: level,
      ncc_response: response || undefined,
      eta_promised_new: eta || undefined,
      ncc_response_status: status as ReminderStatus,
    });
    onSaved();
  };

  return (
    <div role="dialog" aria-labelledby="log-title" className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-4 py-3 border-b">
          <h2 id="log-title" className="font-bold">Ghi log nhắc nhở</h2>
        </div>
        <div className="px-4 py-3 space-y-3">
          <fieldset>
            <legend className="text-sm font-semibold mb-1">Kênh đã dùng</legend>
            {CHANNELS.map(c => (
              <label key={c} className="inline-flex items-center mr-3">
                <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} />
                <span className="ml-1 capitalize">{c}</span>
              </label>
            ))}
          </fieldset>

          <label className="block">
            <span className="text-sm font-semibold">NCC trả lời</span>
            <textarea value={response} onChange={e => setResponse(e.target.value)} className="mt-1 w-full border rounded p-1 text-sm" rows={2} />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">ETA mới hứa (DD/MM/YYYY)</span>
            <input value={eta} onChange={e => setEta(e.target.value)} placeholder="15/05/2026" className="mt-1 w-full border rounded p-1 text-sm" />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold mb-1">Trạng thái</legend>
            {STATUSES.map(s => (
              <label key={s} className="inline-flex items-center mr-3">
                <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
                <span className="ml-1">{s}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm">Hủy</button>
          <button onClick={handleSave} disabled={!canSave}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold disabled:opacity-50">
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
