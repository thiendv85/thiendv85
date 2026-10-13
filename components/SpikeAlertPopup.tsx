import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaIcon } from './Icon';
import { saveSpikeNote } from '../utils/supabase';
import {
    SPIKE_ACTION_LABELS,
    SPIKE_CONCLUSION_LABELS,
    type SpikeAction,
    type SpikeAlertNote,
    type SpikeAlertWithNote,
    type SpikeConclusion,
} from '../utils/spikeAlerts';

interface SpikeAlertPopupProps {
    alert: SpikeAlertWithNote;
    onSaved: (note: SpikeAlertNote) => void;
}

const POPUP_WIDTH = 380;
const fmt = (n: number | null | undefined, digits = 0) =>
    n == null ? '–' : n.toLocaleString('vi-VN', { maximumFractionDigits: digits });
const fmtMoney = (v: number | null) =>
    v == null ? '–' : v >= 1e6 ? `${fmt(v / 1e6, v >= 1e8 ? 0 : 1)} tr đ` : `${fmt(v)} đ`;
const fmtDate = (iso: string) => iso.split('-').reverse().join('/');

/** "Đột biến" badge for an Ordering row; click opens the numbers + the team's conclusion form. */
export const SpikeAlertPopup = ({ alert, onSaved }: SpikeAlertPopupProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [style, setStyle] = useState<React.CSSProperties>({});
    const [conclusion, setConclusion] = useState<SpikeConclusion | ''>(alert.note?.conclusion ?? '');
    const [action, setAction] = useState<SpikeAction | ''>(alert.note?.action ?? '');
    const [dealerCode, setDealerCode] = useState(alert.note?.dealer_code ?? '');
    const [noteText, setNoteText] = useState(alert.note?.note ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const triggerRef = useRef<HTMLSpanElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    const handled = !!alert.note?.conclusion || !!alert.note?.action;
    const label = alert.alert_type === 'NEW' ? 'Mã mới' : `Đột biến ×${fmt(alert.ratio, 1)}`;

    const open = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isOpen) return setIsOpen(false);
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const left = Math.max(10, Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 20));
        const below = rect.bottom + 8 + 460 < window.innerHeight;
        setStyle({
            position: 'fixed',
            left,
            width: POPUP_WIDTH,
            zIndex: 9999,
            ...(below ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }),
        });
        setIsOpen(true);
    };

    useEffect(() => {
        if (!isOpen) return;
        const close = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!triggerRef.current?.contains(t) && !popupRef.current?.contains(t)) setIsOpen(false);
        };
        // Fixed-position popup would drift away from its row when the list scrolls.
        const closeOnScroll = (e: Event) => {
            if (!popupRef.current?.contains(e.target as Node)) setIsOpen(false);
        };
        const closeNow = () => setIsOpen(false);
        document.addEventListener('mousedown', close);
        window.addEventListener('scroll', closeOnScroll, true);
        window.addEventListener('resize', closeNow);
        return () => {
            document.removeEventListener('mousedown', close);
            window.removeEventListener('scroll', closeOnScroll, true);
            window.removeEventListener('resize', closeNow);
        };
    }, [isOpen]);

    const save = async () => {
        setSaving(true);
        setError(null);
        const note = {
            week_end: alert.week_end,
            item_code: alert.item_code,
            conclusion: conclusion || null,
            action: action || null,
            dealer_code: dealerCode.trim() || null,
            note: noteText.trim() || null,
        };
        const res = await saveSpikeNote(note);
        setSaving(false);
        if (!res.success || !res.saved) return setError(res.error || 'Lưu không được.');
        onSaved(res.saved);
        setIsOpen(false);
    };

    const stat = (title: string, value: string, strong = false) => (
        <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase">{title}</div>
            <div className={`text-sm font-black ${strong ? 'text-rose-600' : 'text-slate-700'}`}>{value}</div>
        </div>
    );

    return (
        <>
            <span
                ref={triggerRef}
                onClick={open}
                title="Cảnh báo đột biến tuần – bấm để xem và ghi kết luận"
                className={`text-xs font-black px-1.5 py-0.5 rounded uppercase flex items-center gap-1 cursor-pointer border shadow-sm ${
                    handled
                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                        : 'bg-orange-500 text-white border-orange-600'
                }`}
            >
                <FaIcon className={`fas ${handled ? 'fa-check' : 'fa-bolt'} text-[10px]`} />
                {label}
            </span>

            {isOpen &&
                createPortal(
                    <div
                        ref={popupRef}
                        style={style}
                        onClick={e => e.stopPropagation()}
                        className="animate-fadeIn bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(30,58,138,0.3)] border border-orange-100 overflow-hidden text-left"
                    >
                        <div className="bg-orange-500 px-4 py-2.5 text-white flex justify-between items-center">
                            <span className="text-xs font-black uppercase flex items-center gap-2">
                                <FaIcon className="fas fa-bolt" /> Đột biến · {alert.item_code}
                            </span>
                            <span className="text-[10px] font-bold opacity-90">
                                28 ngày đến {fmtDate(alert.week_end)}
                            </span>
                        </div>

                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                {stat('Bán 28 ngày', fmt(alert.qty_28d), true)}
                                {stat('7 ngày cuối', fmt(alert.qty_7d))}
                                {stat('Mức thường', alert.alert_type === 'NEW' ? 'Mã mới' : fmt(alert.normal_28d, 1))}
                                {stat('Gấp', alert.ratio == null ? '–' : `×${fmt(alert.ratio, 1)}`, true)}
                                {stat('Đơn giá', fmtMoney(alert.unit_cost))}
                                {stat('Phần vượt', fmtMoney(alert.excess_value), true)}
                            </div>
                            <p className="text-[11px] text-slate-500 leading-snug">
                                Chỉ là cảnh báo – ROP và số đặt không đổi. Kiểm tồn và đơn chờ; nếu thiếu, dùng kênh
                                hàng nhanh. Đa số đột biến (63%) quay về mức cũ.
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-[11px] font-bold text-slate-500">
                                    Loại đơn
                                    <select
                                        value={conclusion}
                                        onChange={e => setConclusion(e.target.value as SpikeConclusion | '')}
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
                                    >
                                        <option value="">– Chưa rõ –</option>
                                        {Object.entries(SPIKE_CONCLUSION_LABELS).map(([k, v]) => (
                                            <option key={k} value={k}>
                                                {v}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="text-[11px] font-bold text-slate-500">
                                    Hành động
                                    <select
                                        value={action}
                                        onChange={e => setAction(e.target.value as SpikeAction | '')}
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
                                    >
                                        <option value="">– Chưa quyết –</option>
                                        {Object.entries(SPIKE_ACTION_LABELS).map(([k, v]) => (
                                            <option key={k} value={k}>
                                                {v}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <label className="block text-[11px] font-bold text-slate-500">
                                Mã đại lý (đơn lớn)
                                <input
                                    value={dealerCode}
                                    onChange={e => setDealerCode(e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
                                    placeholder="VD: A6A-0123"
                                />
                            </label>
                            <label className="block text-[11px] font-bold text-slate-500">
                                Ghi chú
                                <textarea
                                    value={noteText}
                                    onChange={e => setNoteText(e.target.value)}
                                    rows={2}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                                />
                            </label>

                            {alert.note?.updated_at && (
                                <div className="text-[10px] text-slate-400">
                                    Cập nhật: {alert.note.updated_by_name || 'người dùng'} ·{' '}
                                    {new Date(alert.note.updated_at).toLocaleString('vi-VN')}
                                </div>
                            )}
                            {error && <div className="text-xs font-bold text-rose-600">{error}</div>}

                            <button
                                onClick={save}
                                disabled={saving}
                                className="w-full h-9 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black uppercase disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <FaIcon className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
                                {saving ? 'Đang lưu...' : 'Lưu kết luận'}
                            </button>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
};
