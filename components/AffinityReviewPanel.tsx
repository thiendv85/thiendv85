import React from 'react';
import { FaIcon } from './Icon';
import type { AffinitySuggestion } from '../types/inventory';

interface Props {
    mandatoryMissing: AffinitySuggestion[];
    recommended: AffinitySuggestion[];
    itemNames?: Record<string, string>;
    onAdd: (sku: string) => void;
    onSkip?: (sku: string) => void;
}

const scoreColor = (score: number) =>
    score >= 80 ? 'text-rose-700 bg-rose-50 border-rose-200'
    : score >= 50 ? 'text-orange-700 bg-orange-50 border-orange-200'
    : 'text-slate-600 bg-slate-50 border-slate-200';

const SuggestionRow = ({ s, name, onAdd, onSkip }: {
    s: AffinitySuggestion;
    name?: string;
    onAdd: () => void;
    onSkip?: () => void;
}) => (
    <div className="flex items-start justify-between gap-3 py-2.5 px-3 border-b border-slate-100 last:border-b-0">
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-black text-slate-800">{s.relatedPart}</span>
                {s.type === 'recommended' && (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${scoreColor(s.score)}`}>
                        {s.score}
                    </span>
                )}
            </div>
            {name && <div className="text-xs text-slate-500 truncate mt-0.5">{name}</div>}
            <div className="text-[10px] text-slate-400 mt-0.5">
                Do đặt: <span className="font-mono">{s.triggeredBy.join(', ')}</span>
                {s.note && <span className="ml-2 italic">— {s.note}</span>}
            </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
            <button
                onClick={onAdd}
                className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
                + Thêm
            </button>
            {onSkip && (
                <button
                    onClick={onSkip}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-700"
                >
                    Bỏ qua
                </button>
            )}
        </div>
    </div>
);

export const AffinityReviewPanel = ({
    mandatoryMissing, recommended, itemNames, onAdd, onSkip,
}: Props) => {
    if (mandatoryMissing.length === 0 && recommended.length === 0) return null;

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <FaIcon className="fas fa-link text-blue-500" />
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Mã liên quan (gợi ý)
                </span>
            </div>

            {mandatoryMissing.length > 0 && (
                <div className="border-l-4 border-rose-500">
                    <div className="px-3 py-1.5 bg-rose-50 text-rose-700 text-[11px] font-black uppercase">
                        ⚠ Thiếu (bắt buộc) — {mandatoryMissing.length}
                    </div>
                    {mandatoryMissing.map(s => (
                        <SuggestionRow
                            key={s.relatedPart}
                            s={s}
                            name={itemNames?.[s.relatedPart]}
                            onAdd={() => onAdd(s.relatedPart)}
                            onSkip={onSkip ? () => onSkip(s.relatedPart) : undefined}
                        />
                    ))}
                </div>
            )}

            {recommended.length > 0 && (
                <div className="border-l-4 border-blue-400">
                    <div className="px-3 py-1.5 bg-blue-50 text-blue-700 text-[11px] font-black uppercase">
                        ✨ Khuyến nghị — top {recommended.length}
                    </div>
                    {recommended.map(s => (
                        <SuggestionRow
                            key={s.relatedPart}
                            s={s}
                            name={itemNames?.[s.relatedPart]}
                            onAdd={() => onAdd(s.relatedPart)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
