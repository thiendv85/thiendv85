import React, { useEffect, useRef, useState } from 'react';
import { useApprovalNotifications } from '../hooks/useApprovalNotifications';
import type { ApprovalRequest } from '../types/inventory';

import { FaIcon } from './Icon';
interface Props {
    onNavigate: (requestId?: string) => void;
}

const REJECTED_LOOKBACK_LABEL = '3 ngày qua';

const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return new Date(iso).toLocaleDateString('vi-VN');
};

export const NotificationBell = ({ onNavigate }: Props) => {
    const { pendingForMe, returnedToMe, rejectedRecent, total, isLoading, refetch } = useApprovalNotifications();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    const handleClickItem = (req: ApprovalRequest) => {
        setOpen(false);
        onNavigate(req.id);
    };

    const renderSection = (
        title: string,
        items: ApprovalRequest[],
        icon: string,
        color: string,
        emptyMsg: string,
    ) => (
        <div className="border-b border-slate-100 last:border-b-0">
            <div className="px-4 py-2 bg-slate-50/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FaIcon className={`fas ${icon} ${color} text-xs`}  />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">{title}</span>
                </div>
                <span className="text-[10px] font-black text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                    {items.length}
                </span>
            </div>
            {items.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400 italic">{emptyMsg}</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {items.slice(0, 8).map(req => (
                        <li
                            key={req.id}
                            onClick={() => handleClickItem(req)}
                            className="px-4 py-2.5 hover:bg-blue-50/60 cursor-pointer transition-colors flex items-start gap-3"
                        >
                            <div className={`w-2 h-2 rounded-full mt-1.5 ${color.replace('text-', 'bg-')} shrink-0`} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-slate-800 truncate" title={req.draft_name}>
                                        {req.draft_name}
                                    </span>
                                    {req.brand && (
                                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-wider shrink-0">
                                            {req.brand}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-bold">
                                    <span>Lv {req.current_level}</span>
                                    <span>·</span>
                                    <span>{formatRelative(req.submitted_at)}</span>
                                </div>
                            </div>
                            <FaIcon className="fas fa-chevron-right text-slate-300 text-[10px] mt-1.5 shrink-0"  />
                        </li>
                    ))}
                    {items.length > 8 && (
                        <li
                            onClick={() => { setOpen(false); onNavigate(); }}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 cursor-pointer text-center"
                        >
                            Xem tất cả ({items.length})
                        </li>
                    )}
                </ul>
            )}
        </div>
    );

    return (
        <div ref={wrapRef} className="relative">
            <button
                onClick={() => { setOpen(o => !o); if (!open) refetch(); }}
                title={total > 0 ? `${total} thông báo` : 'Thông báo'}
                className={`relative p-2 rounded-lg transition-all ${
                    open ? 'bg-blue-500/30 text-blue-200' : 'text-slate-400 hover:text-blue-300 hover:bg-blue-500/15'
                }`}
            >
                <FaIcon className={`fas fa-bell text-base md:text-lg ${total > 0 ? 'animate-[swing_1s_ease-in-out_infinite]' : ''}`} />
                {total > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg">
                        {total > 99 ? '99+' : total}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-[380px] max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden animate-[dropdownIn_0.15s_ease-out]">
                    <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FaIcon className="fas fa-bell text-blue-300 text-xs"  />
                            <span className="text-xs font-black uppercase tracking-widest">Thông báo</span>
                            {isLoading && <FaIcon className="fas fa-circle-notch fa-spin text-blue-300 text-[10px]"  />}
                        </div>
                        <button
                            onClick={() => { refetch(); }}
                            title="Làm mới"
                            className="text-white/40 hover:text-white text-xs p-1 rounded hover:bg-white/10 transition-colors"
                        >
                            <FaIcon className="fas fa-arrows-rotate"  />
                        </button>
                    </div>

                    <div className="max-h-[480px] overflow-y-auto">
                        {total === 0 && !isLoading ? (
                            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                <FaIcon className="fas fa-circle-check text-3xl mb-2 text-emerald-300"  />
                                <span className="text-xs font-bold">Bạn đã xử lý hết!</span>
                            </div>
                        ) : (
                            <>
                                {renderSection(
                                    'Cần bạn duyệt',
                                    pendingForMe,
                                    'fa-clipboard-check',
                                    'text-amber-600',
                                    'Không có đơn cần duyệt',
                                )}
                                {renderSection(
                                    'Đơn cần sửa',
                                    returnedToMe,
                                    'fa-rotate-left',
                                    'text-indigo-600',
                                    'Không có đơn cần sửa',
                                )}
                                {renderSection(
                                    `Đơn bị từ chối (${REJECTED_LOOKBACK_LABEL})`,
                                    rejectedRecent,
                                    'fa-circle-xmark',
                                    'text-rose-600',
                                    'Không có đơn bị từ chối',
                                )}
                            </>
                        )}
                    </div>

                    <div
                        onClick={() => { setOpen(false); onNavigate(); }}
                        className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-center text-xs font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                        Mở trang phê duyệt <FaIcon className="fas fa-arrow-right ml-1 text-[10px]"  />
                    </div>
                </div>
            )}

            <style>{`
                @keyframes swing {
                    0%, 100% { transform: rotate(0); }
                    20% { transform: rotate(-12deg); }
                    40% { transform: rotate(10deg); }
                    60% { transform: rotate(-6deg); }
                    80% { transform: rotate(4deg); }
                }
                @keyframes dropdownIn {
                    from { opacity: 0; transform: translateY(-6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};
