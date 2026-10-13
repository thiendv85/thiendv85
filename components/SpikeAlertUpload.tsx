import React, { useEffect, useMemo, useState } from 'react';
import { FaIcon } from './Icon';
import { useAuth } from '../utils/authContext';
import { loadLatestSpikeAlerts, saveSpikeAlerts } from '../utils/supabase';
import { buildZaloMessages, parseSpikeAlertCSV, type SpikeAlert } from '../utils/spikeAlerts';

const UPLOAD_ROLES = ['admin', 'super_admin', 'planner'];
const fmtDate = (iso: string) => iso.split('-').reverse().join('/');
const fmtTy = (v: number) => `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ đ`;

/** Settings card: upload the weekly CSV from `EXEC dbo.usp_WeeklySpikeAlert` (planner/admin only). */
export const SpikeAlertUpload = () => {
    const { profile } = useAuth();
    const canUpload = UPLOAD_ROLES.includes(profile?.role ?? '');
    const [current, setCurrent] = useState<{ weekEnd: string | null; alerts: SpikeAlert[] } | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [preview, setPreview] = useState<{ filename: string; rows: SpikeAlert[] } | null>(null);
    const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const refreshCurrent = async () => {
        const res = await loadLatestSpikeAlerts();
        setCurrent({ weekEnd: res.weekEnd, alerts: res.alerts });
        if (res.error) setMessage({ ok: false, text: `Không đọc được cảnh báo trên Cloud: ${res.error}` });
    };

    useEffect(() => {
        refreshCurrent();
    }, []);

    const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setStatus('idle');
        const { rows, error } = parseSpikeAlertCSV(await file.text());
        if (error) {
            setPreview(null);
            setMessage({ ok: false, text: error });
            return;
        }
        setPreview({ filename: file.name, rows });
        setMessage(null);
    };

    const upload = async () => {
        if (!preview) return;
        setStatus('saving');
        const res = await saveSpikeAlerts(preview.rows);
        if (!res.success) {
            setStatus('idle');
            setMessage({ ok: false, text: `Lỗi khi lưu: ${res.error}` });
            return;
        }
        setStatus('done');
        setMessage({ ok: true, text: `Đã nạp ${res.inserted} cảnh báo tuần ${fmtDate(preview.rows[0].week_end)}.` });
        setPreview(null);
        refreshCurrent();
    };

    const copy = async (group: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(group);
        } catch {
            setMessage({ ok: false, text: 'Trình duyệt không cho chép — bấm vào ô tin, Ctrl+A, Ctrl+C.' });
        }
    };

    const zalo = useMemo(() => buildZaloMessages(current?.alerts ?? []), [current]);
    const week = preview?.rows[0]?.week_end;
    const excess = preview?.rows.reduce((s, r) => s + (r.excess_value || 0), 0) ?? 0;
    const newCount = preview?.rows.filter(r => r.alert_type === 'NEW').length ?? 0;

    return (
        <div className="space-y-4">
            <div className="p-3 bg-orange-50 rounded-xl border border-orange-100 text-xs text-orange-700 font-bold">
                <FaIcon className="fas fa-info-circle mr-2" />
                Hằng tuần, sau khi nạp đơn đại lý: chạy <code>EXEC dbo.usp_WeeklySpikeAlert</code> trong SSMS, lưu kết
                quả CSV (bật "Include column headers"), rồi nạp ở đây. Trang Đặt hàng sẽ hiện nhãn{' '}
                <strong>Đột biến</strong> và bộ lọc riêng. Nạp lại cùng tuần sẽ thay số liệu, giữ nguyên ghi chú.
            </div>

            <div
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                    current?.weekEnd
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border border-amber-200 text-amber-700'
                }`}
            >
                <FaIcon className={`fas ${current?.weekEnd ? 'fa-calendar-check' : 'fa-triangle-exclamation'}`} />
                {current === null
                    ? 'Đang kiểm tra...'
                    : current.weekEnd
                      ? `Tuần hiện tại: đến ${fmtDate(current.weekEnd)} · ${current.alerts.length} mã`
                      : 'Chưa có cảnh báo tuần nào trên Cloud'}
            </div>

            {canUpload ? (
                <div className="flex items-center gap-3">
                    <label className="flex-1 flex items-center gap-3 h-14 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl px-4 cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-all group">
                        <FaIcon className="fas fa-file-csv text-slate-400 group-hover:text-orange-500 transition-colors" />
                        <span className="text-sm font-bold text-slate-500 group-hover:text-orange-600 transition-colors truncate">
                            {preview
                                ? `${preview.filename} · tuần đến ${fmtDate(week!)} · ${preview.rows.length} mã` +
                                  (newCount ? ` (${newCount} mã mới)` : '') +
                                  ` · vượt ${fmtTy(excess)}`
                                : 'Chọn CSV cảnh báo tuần...'}
                        </span>
                        <input type="file" accept=".csv" className="hidden" onChange={pick} />
                    </label>
                    <button
                        onClick={upload}
                        disabled={!preview || status === 'saving'}
                        className={`h-14 px-5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${
                            !preview || status === 'saving'
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-orange-500 text-white hover:bg-orange-600 shadow-md shadow-orange-200'
                        }`}
                    >
                        <FaIcon
                            className={`fas ${status === 'saving' ? 'fa-spinner fa-spin' : status === 'done' ? 'fa-check' : 'fa-cloud-arrow-up'}`}
                        />
                        {status === 'saving' ? 'Đang lưu...' : 'Upload'}
                    </button>
                </div>
            ) : (
                <div className="text-xs font-bold text-slate-400">Chỉ Admin / Planner được nạp cảnh báo tuần.</div>
            )}

            {zalo.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-black text-slate-500 uppercase">
                        <FaIcon className="fas fa-comment-dots mr-2" />
                        Tin Zalo theo nhóm hãng · gửi từng nhóm
                    </div>
                    {zalo.map(m => (
                        <details key={m.group} className="rounded-xl border border-slate-200 bg-white">
                            <summary className="flex items-center gap-3 px-3 py-2 cursor-pointer text-xs font-bold text-slate-700">
                                <span className="flex-1">
                                    {m.group} · {m.count} mã
                                    {m.excess > 0 && ` · vượt ${fmtTy(m.excess)}`}
                                </span>
                                <button
                                    onClick={e => {
                                        e.preventDefault();
                                        copy(m.group, m.text);
                                    }}
                                    className={`h-7 px-3 rounded-lg text-[11px] font-black uppercase flex items-center gap-1.5 transition-all ${
                                        copied === m.group
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-sky-500 text-white hover:bg-sky-600'
                                    }`}
                                >
                                    <FaIcon className={`fas ${copied === m.group ? 'fa-check' : 'fa-copy'}`} />
                                    {copied === m.group ? 'Đã chép' : 'Chép tin'}
                                </button>
                            </summary>
                            <textarea
                                readOnly
                                value={m.text}
                                rows={Math.min(16, m.text.split('\n').length)}
                                onFocus={e => e.target.select()}
                                className="w-full border-t border-slate-100 px-3 py-2 font-mono text-[11px] text-slate-600 bg-slate-50 rounded-b-xl"
                            />
                        </details>
                    ))}
                </div>
            )}

            {message && (
                <div className={`text-xs font-bold ${message.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {message.text}
                </div>
            )}
        </div>
    );
};
