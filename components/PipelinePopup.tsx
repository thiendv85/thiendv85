
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Typography } from './Typography';

interface PipelinePopupProps {
    pipeline: Record<string, number>;
    pipelineNB?: Record<string, number>;
    pipelineBB?: Record<string, number>;
    children?: React.ReactNode;
}

export const PipelinePopup = ({ pipeline, pipelineNB, pipelineBB, children }: PipelinePopupProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [arrowClass, setArrowClass] = useState('');

    const entries = useMemo(() => {
        if (!pipeline) return [];
        return Object.entries(pipeline)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, qty]) => ({
                key,
                qty,
                qtyNB: pipelineNB?.[key] || 0,
                qtyBB: pipelineBB?.[key] || 0
            }));
    }, [pipeline, pipelineNB, pipelineBB]);

    const stats = useMemo(() => {
        const total = Object.values(pipeline || {}).reduce((s, v) => s + v, 0);
        const nb = Object.values(pipelineNB || {}).reduce((s, v) => s + v, 0);
        const bb = Object.values(pipelineBB || {}).reduce((s, v) => s + v, 0);
        return { total, nb, bb, count: entries.length };
    }, [pipeline, pipelineNB, pipelineBB, entries]);

    const togglePopup = () => {
        if (isOpen) {
            setIsOpen(false);
            return;
        }
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        const POPUP_WIDTH = 450;
        const GAP = 10;
        const POPUP_MAX_HEIGHT = 450;

        const contentHeight = Math.min((entries.length * 45) + 180, POPUP_MAX_HEIGHT);

        let left = rect.left + (rect.width / 2) - (POPUP_WIDTH / 2);
        if (left + POPUP_WIDTH > window.innerWidth) left = window.innerWidth - POPUP_WIDTH - 20;
        if (left < 10) left = 10;

        let top = rect.top - contentHeight - GAP;
        let arrowStyle = 'absolute -bottom-2 w-4 h-4 bg-white border-b border-r border-blue-200 rotate-45';

        if (top < 10) {
            top = rect.bottom + GAP;
            arrowStyle = 'absolute -top-2 w-4 h-4 bg-white border-t border-l border-blue-200 rotate-45';
        }

        setPortalStyle({
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
            width: `${POPUP_WIDTH}px`,
            maxHeight: `${POPUP_MAX_HEIGHT}px`,
            zIndex: 9999
        });
        setArrowClass(arrowStyle);
        setIsOpen(true);
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleOutsideClick = (e: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                popupRef.current && !popupRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [isOpen]);

    const arrowInlineStyle = React.useMemo(() => {
        if (!triggerRef.current || !(portalStyle as any).left) return {};
        const rect = triggerRef.current.getBoundingClientRect();
        const popupLeft = parseFloat((portalStyle as any).left as string);
        const arrowLeft = rect.left - popupLeft + (rect.width / 2) - 8;
        return { left: `${Math.max(20, Math.min(410, arrowLeft))}px` };
    }, [isOpen, portalStyle]);

    return (
        <>
            <div
                ref={triggerRef}
                className="w-full h-full cursor-pointer"
                onClick={(e) => { e.stopPropagation(); togglePopup(); }}
            >
                {children}
            </div>

            {isOpen && createPortal(
                <div
                    ref={popupRef}
                    style={portalStyle}
                    className="animate-fadeIn flex flex-col pointer-events-auto"
                >
                    <div className="bg-white rounded-[2rem] shadow-[0_25px_60px_-15px_rgba(37,99,235,0.25)] border border-blue-50 overflow-hidden flex flex-col relative">
                        <div className={arrowClass} style={arrowInlineStyle}></div>

                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center shadow-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
                                    <i className="fas fa-truck-fast"></i>
                                </div>
                                <Typography variant="label" className="text-white !text-sm font-black uppercase tracking-widest">
                                    PIPELINE (PO)
                                </Typography>
                            </div>
                            <div className="flex gap-2">
                                <span className="bg-emerald-500/20 text-emerald-100 text-[9px] font-black px-2 py-1 rounded-lg border border-emerald-500/20 uppercase">NB: {stats.nb}</span>
                                <span className="bg-blue-500/20 text-blue-100 text-[9px] font-black px-2 py-1 rounded-lg border border-blue-500/20 uppercase">BB: {stats.bb}</span>
                                <span className="bg-white/10 text-white text-[9px] font-black px-2 py-1 rounded-lg border border-white/10 uppercase">{stats.count} PO</span>
                            </div>
                        </div>

                        {entries.length > 0 ? (
                            <>
                                <div className="overflow-y-auto custom-scrollbar flex-1 p-4 max-h-[300px] bg-white">
                                    <div className="grid gap-3">
                                        {entries.map((entry, idx) => {
                                            const isDate = entry.key.replace(/\D/g, '').length >= 4;
                                            const label = isDate ? entry.key : 'Chưa Invoice';
                                            
                                            return (
                                                <div key={idx} className="group/item bg-slate-50/50 hover:bg-blue-50/50 p-4 rounded-2xl border border-slate-100 hover:border-blue-200 transition-all duration-300">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${entry.qtyNB > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                                {entry.qtyNB > 0 ? 'NB' : 'BB'}
                                                            </div>
                                                            <Typography variant="mono" className="text-slate-900 !text-sm font-black tracking-tight">{label}</Typography>
                                                        </div>
                                                        <Typography variant="mono" className="text-blue-600 !text-base font-black">+{entry.qty.toLocaleString()}</Typography>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="p-10 text-center bg-white">
                                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-200">
                                    <i className="fas fa-box-open text-2xl"></i>
                                </div>
                                <Typography variant="label" className="text-slate-400 font-black uppercase tracking-widest">Không có PO đang về</Typography>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
