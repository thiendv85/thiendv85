import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SalesHistoryChart } from './SalesHistoryChart';

interface SalesMomentumProps {
    values: number[]; // [24M, 12M, 6M, 3M]
    history?: number[]; // 12 months history
    forecast?: number;
    compact?: boolean; // Dense mode for table rows
}

export const SalesMomentum = ({ values, history = [], forecast = 0, compact = false }: SalesMomentumProps) => {
    // --- MINI SPARKLINE CONFIG ---
    const width = compact ? 100 : 140;
    const height = compact ? 24 : 40;
    const padding = 8;

    const cleanValues = values.map(v => v || 0);
    const max = Math.max(...cleanValues, 1);
    const min = Math.min(...cleanValues, 0);

    const getX = (i: number) => {
        const divider = cleanValues.length > 1 ? cleanValues.length - 1 : 1;
        return padding + (i / divider) * (width - padding * 2);
    };
    const getY = (v: number) => {
        const diff = max - min || 1;
        const val = isFinite(v) ? v : 0;
        return height - padding - ((val - min) / diff) * (height - padding * 2);
    };

    const points = cleanValues.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
    const areaPath = `${points} L ${getX(cleanValues.length - 1)},${height} L ${getX(0)},${height} Z`;

    const first = cleanValues[0];
    const last = cleanValues[cleanValues.length - 1];
    const trend = ((last - first) / (first || 1)) * 100;

    const isGrowing = trend > 5;
    const isDropping = trend < -5;

    const config = isGrowing
        ? { color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'fa-arrow-trend-up' }
        : isDropping
            ? { color: '#f43f5e', bg: 'bg-rose-50', text: 'text-rose-700', icon: 'fa-arrow-trend-down' }
            : { color: '#6366f1', bg: 'bg-slate-50', text: 'text-slate-700', icon: 'fa-minus' };

    // --- CLICK TOGGLE LOGIC ---
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        if (!isOpen) return;
        const handleOutsideClick = (e: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                modalRef.current && !modalRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [isOpen]);

    return (
        <>
            <div
                ref={triggerRef}
                className="relative w-full max-w-[160px]"
                onClick={() => setIsOpen(prev => !prev)}
            >
                {/* === MINI SPARKLINE === */}
                <div className={`flex flex-col ${compact ? 'p-1' : 'p-2'} rounded-xl transition-all duration-300 ${config.bg} border border-transparent hover:border-slate-300 hover:shadow-md cursor-help`}>
                    {/* Header — hidden in compact mode */}
                    {!compact && (
                        <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-2xs font-black uppercase tracking-widest text-slate-400">Momentum</span>
                            <div className={`flex items-center gap-1 ${config.text}`}>
                                <i className={`fas ${config.icon} text-2xs`}></i>
                                <span className="text-2xs font-black">{Math.abs(trend).toFixed(0)}%</span>
                            </div>
                        </div>
                    )}

                    {/* Trend badge inline for compact mode */}
                    {compact && (
                        <div className={`flex items-center gap-0.5 mb-0.5 ${config.text}`}>
                            <i className={`fas ${config.icon} text-[9px]`}></i>
                            <span className="text-[9px] font-black">{Math.abs(trend).toFixed(0)}%</span>
                        </div>
                    )}

                    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                        <defs>
                            <linearGradient id={`grad-${last}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={config.color} stopOpacity="0.3" />
                                <stop offset="100%" stopColor={config.color} stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <line x1={getX(0)} y1={getY(first)} x2={getX(3)} y2={getY(first)} stroke={config.color} strokeWidth="1" strokeDasharray="3,3" opacity="0.2" />
                        <path d={`M ${areaPath}`} fill={`url(#grad-${last})`} />
                        <polyline points={points} fill="none" stroke={config.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        {cleanValues.map((v, i) => (
                            <circle key={i} cx={getX(i)} cy={getY(v)} r={i === 3 ? "3" : "1.5"} fill={i === 3 ? config.color : "white"} stroke={config.color} strokeWidth="1.5" />
                        ))}
                    </svg>

                    {/* Bottom labels — hidden in compact mode */}
                    {!compact && (
                        <div className="flex justify-between mt-2 px-0.5">
                            {['24M', '12M', '6M', '3M'].map((label, i) => (
                                <div key={label} className="flex flex-col items-center">
                                    <span className="text-2xs text-slate-400 font-bold tracking-tighter">{label}</span>
                                    <span className={`text-2xs font-black tracking-tighter ${i === 3 ? config.text : 'text-slate-600'}`}>
                                        {cleanValues[i].toFixed(0)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* === PORTAL FLOATING CARD (CENTERED MODAL PATTERN FROM SKUDETAIL) === */}
            {isOpen && history && history.length > 0 && createPortal(
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fadeIn"
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsOpen(false)}
                    ></div>

                    {/* Modal Content */}
                    <div ref={modalRef} className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-[scaleIn_0.2s_ease-out]">
                        {/* Decorative Top Bar */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-rose-500"></div>

                        {/* Close Button */}
                        <button
                            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all z-10"
                            onClick={() => setIsOpen(false)}
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>

                        {/* Content */}
                        <div className="p-5 overflow-y-auto flex-1 min-h-0">
                            {/* Header & Stats */}
                            <div className="flex justify-between items-start mb-4 pr-6">
                                <div>
                                    <h4 className="flex items-center gap-2 text-xs font-black text-slate-800 uppercase tracking-widest">
                                        <i className="fas fa-chart-line text-emerald-600"></i> DEMAND ANALYTICS
                                    </h4>
                                    <p className="text-2xs text-slate-400 font-bold mt-0.5">12-Month Rolling History</p>
                                </div>
                                <div className="flex gap-2">
                                    <div className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-100 flex flex-col items-center min-w-[55px]">
                                        <span className="text-2xs font-black text-amber-600 uppercase tracking-wide">FCST</span>
                                        <span className="text-sm font-black text-amber-700">{forecast}</span>
                                    </div>
                                    <div className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 flex flex-col items-center min-w-[55px]">
                                        <span className="text-2xs font-black text-rose-600 uppercase tracking-wide">PEAK</span>
                                        <span className="text-sm font-black text-rose-700">{Math.max(...history)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Summary Grid */}
                            <div className="grid grid-cols-4 gap-1 mb-4 bg-slate-50/80 rounded-xl p-2.5 border border-slate-100">
                                {[
                                    { l: 'AVG 24M', v: values[0] },
                                    { l: 'AVG 12M', v: values[1] },
                                    { l: 'AVG 6M', v: values[2] },
                                    { l: 'AVG 3M', v: values[3] }
                                ].map((s, idx) => (
                                    <div key={idx} className="text-center border-r border-slate-200 last:border-0">
                                        <div className="text-2xs font-bold text-slate-400 uppercase tracking-tight">{s.l}</div>
                                        <div className="text-sm font-black text-slate-800 leading-tight mt-0.5">{s.v?.toFixed(1) || 0}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Reusable Chart Component */}
                            <SalesHistoryChart history={history} forecast={forecast} />
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* CSS Animation */}
            <style>{`
                @keyframes scaleIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `}</style>
        </>
    );
};

