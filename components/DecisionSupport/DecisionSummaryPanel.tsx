import { DecisionSummary, DecisionStatus } from '../../hooks/useDecisionSupport';

interface Props {
    summary: DecisionSummary;
    onReset: () => void;
}

const RECO_CONFIG: Record<DecisionStatus, { label: string; cls: string; icon: string; bg: string }> = {
    ready: { label: 'Ready to Approve', cls: 'text-emerald-700 border-emerald-200 bg-emerald-50', icon: 'fa-circle-check', bg: 'bg-emerald-500' },
    attention: { label: 'Approve with Attention', cls: 'text-cyan-700 border-cyan-200 bg-cyan-50', icon: 'fa-eye', bg: 'bg-cyan-500' },
    adjust:  { label: 'Adjustment Recommended', cls: 'text-amber-700 border-amber-200 bg-amber-50', icon: 'fa-triangle-exclamation', bg: 'bg-amber-500' },
    not_recommended: { label: 'Do Not Approve Without Review', cls: 'text-rose-700 border-rose-200 bg-rose-50', icon: 'fa-circle-xmark', bg: 'bg-rose-500' },
};

export const DecisionSummaryPanel = ({ summary, onReset }: Props) => {
    const config = RECO_CONFIG[summary.status];

    const { counts, metrics } = summary;

    return (
        <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-[100] p-6 animate-slideDown">
            <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                
                {/* 1. Primary Recommendation */}
                <div className="flex items-center gap-6 shrink-0">
                    <div className={`w-16 h-16 rounded-3xl ${config.bg} flex items-center justify-center shadow-lg shadow-inner overflow-hidden relative group`}>
                        <i className={`fas ${config.icon} text-white text-3xl transition-transform group-hover:scale-110`} />
                        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className={`text-2xl font-black ${config.cls.split(' ')[0]} tracking-tight uppercase`}>
                                {config.label}
                            </h2>
                            <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${summary.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                Confidence: {summary.confidence}
                            </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm font-bold text-slate-500">
                            <span className="flex items-center gap-1.5"><i className="fas fa-layer-group text-[10px]" /> {counts.totalSkus} SKUs in Draft</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                            <span className="flex items-center gap-1.5"><i className="fas fa-check-double text-[10px]" /> {counts.selectedSkus} Selected</span>
                            {counts.changedSkus > 0 && (
                                <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                    <span className="text-blue-600 flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 animate-pulse">
                                        <i className="fas fa-pen-to-square text-[10px]" /> {counts.changedSkus} Adjusted
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Evidence Bullets */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {summary.reasons.slice(0, 4).map((reason, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100/50 hover:bg-slate-100/50 transition-colors">
                            <div className={`mt-1 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full ${reason.severity === 'critical' ? 'bg-rose-100 text-rose-600' : reason.severity === 'major' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                <i className={`fas ${reason.severity === 'critical' ? 'fa-circle-exclamation' : 'fa-info-circle'} text-[10px]`} />
                            </div>
                            <div>
                                <div className="text-[11px] font-black text-slate-800 uppercase tracking-wide leading-none mb-1">{reason.title}</div>
                                <div className="text-[11px] font-bold text-slate-500 leading-tight">{reason.description}</div>
                            </div>
                        </div>
                    ))}
                    {summary.reasons.length === 0 && (
                        <div className="col-span-2 flex items-center justify-center p-4 bg-emerald-50/30 rounded-2xl border border-dashed border-emerald-200">
                            <span className="text-sm font-bold text-emerald-600 italic">No critical issues detected. Order is clean for approval.</span>
                        </div>
                    )}
                </div>

                {/* 3. Global Action Context */}
                <div className="shrink-0 flex items-center gap-3">
                    {counts.changedSkus > 0 && (
                        <button onClick={onReset} className="px-5 py-3 rounded-2xl text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all">
                            Reset Changes
                        </button>
                    )}
                    {/* Primary CTA can be added here or kept below in toolbar */}
                </div>

            </div>
        </div>
    );
};
