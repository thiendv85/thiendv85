
import React from 'react';
import { SupersessionGraph } from '../utils/supersessionGraph';
import { AlertTriangle, ArrowRight, Check, X } from 'lucide-react';

interface SupersessionWarningProps {
    partNumber: string;
    qty: number;
    graph?: SupersessionGraph;
    onUseCurrentPart: (oldPart: string, currentPart: string, qty: number) => void;
    onKeepOldPart: (partNumber: string) => void;
}

export const SupersessionWarning: React.FC<SupersessionWarningProps> = ({ 
    partNumber, 
    qty,
    graph, 
    onUseCurrentPart,
    onKeepOldPart
}) => {
    if (!graph) return null;
    const chain = graph.getChain(partNumber);
    if (!chain || chain.currentPart === partNumber) return null;

    return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center animate-fadeIn my-2">
            <div className="bg-amber-100 p-2 rounded-full text-amber-600 shrink-0">
                <AlertTriangle size={20} />
            </div>
            
            <div className="flex-1">
                <h4 className="text-sm font-black text-amber-800 uppercase tracking-wide mb-1">
                    Mã này đã bị thay thế!
                </h4>
                <div className="text-xs text-amber-700 space-y-1">
                    <p className="flex items-center gap-2">
                        Mã cũ: <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-amber-100">{partNumber}</span>
                        <ArrowRight size={12} />
                        Mã mới: <span className="font-mono font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100">{chain.currentPart}</span>
                    </p>
                    <p className="font-medium italic opacity-90">
                        Khuyến nghị: Chuyển <strong>{qty}</strong> cái sang mã mới <strong>{chain.currentPart}</strong>.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                <button 
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all shadow-sm active:scale-95"
                    onClick={() => onUseCurrentPart(partNumber, chain.currentPart, qty)}
                >
                    <Check size={14} /> Dùng mã mới
                </button>
                <button 
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white hover:bg-amber-100 text-amber-700 border border-amber-200 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all"
                    onClick={() => onKeepOldPart(partNumber)}
                >
                    <X size={14} /> Giữ mã cũ
                </button>
            </div>
        </div>
    );
};
