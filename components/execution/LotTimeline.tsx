import React from 'react';
import type { ReceiptLot } from '../../types/execution';

// Chỉ lấy phần ngày (YYYY-MM-DD) để hiển thị gọn dưới mỗi mốc.
const fmtDate = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

interface Milestone {
    label: string;
    done: boolean;
    date: string;
    extra?: string; // thông tin phụ (cảng, kho)
}

export default function LotTimeline({ lot }: { lot: ReceiptLot }) {
    const milestones: Milestone[] = [
        {
            label: 'Invoice',
            done: !!lot.invoice_no,
            date: fmtDate(lot.invoice_date),
            extra: lot.invoice_no ?? '',
        },
        {
            label: 'ETD',
            done: !!lot.etd_pol,
            date: fmtDate(lot.etd_pol),
        },
        {
            label: 'ETA',
            done: !!lot.eta_pod,
            date: fmtDate(lot.eta_pod),
            extra: lot.port ?? '',
        },
        {
            label: 'Về kho dự kiến',
            done: !!lot.expected_wh_date,
            date: fmtDate(lot.expected_wh_date),
        },
        {
            label: 'Về kho thực tế',
            done: !!lot.actual_wh_date,
            date: fmtDate(lot.actual_wh_date),
            extra: lot.warehouse ?? '',
        },
    ];

    return (
        <div className="flex items-start gap-1 py-1.5">
            {milestones.map((m, i) => (
                <React.Fragment key={m.label}>
                    <div className="flex flex-col items-center text-center min-w-[64px]">
                        <span
                            className={`flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black ${
                                m.done
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-200 text-slate-400'
                            }`}
                        >
                            {m.done ? <i className="fas fa-check" /> : i + 1}
                        </span>
                        <span
                            className={`mt-1 text-[9px] font-bold leading-tight ${
                                m.done ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                        >
                            {m.label}
                        </span>
                        {m.date && (
                            <span className="text-[9px] text-slate-500 leading-tight">{m.date}</span>
                        )}
                        {m.extra && (
                            <span className="text-[9px] text-slate-400 leading-tight truncate max-w-[64px]">
                                {m.extra}
                            </span>
                        )}
                    </div>
                    {i < milestones.length - 1 && (
                        <div
                            className={`flex-1 h-0.5 mt-2.5 rounded-full ${
                                m.done ? 'bg-emerald-300' : 'bg-slate-200'
                            }`}
                        />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}
