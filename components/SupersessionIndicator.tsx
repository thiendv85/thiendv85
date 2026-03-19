
import React from 'react';
import { SupersessionGraph } from '../utils/supersessionGraph';
import { RefreshCw, Link, AlertTriangle, CheckCircle } from 'lucide-react';
import { Typography } from './Typography';

interface SupersessionIndicatorProps {
    partNumber: string;
    graph?: SupersessionGraph;
    onClick?: (e: React.MouseEvent) => void;
}

export const SupersessionIndicator: React.FC<SupersessionIndicatorProps> = ({
    partNumber,
    graph,
    onClick
}) => {
    if (!graph) return null;

    // FIX: Use robust getChain method
    const chain = graph.getChain(partNumber);

    // Case 1: No Chain (Standalone)
    // chainDepth <= 1 usually means it's just the item itself if logic allows single-node chains, 
    // but usually chains map implies at least 2 nodes. 
    // If undefined, it's definitely standalone.
    if (!chain || chain.allParts.length <= 1) {
        return null;
    }

    const isCurrent = chain.currentPart === partNumber;
    const isSuperseded = !isCurrent;

    // Handler to stop propagation if inside a clickable row
    const handleClick = (e: React.MouseEvent) => {
        if (onClick) {
            e.stopPropagation();
            onClick(e);
        }
    };

    if (isSuperseded) {
        return (
            <div
                onClick={handleClick}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 cursor-pointer hover:bg-amber-100 hover:border-amber-300 transition-all group"
                title={`⚠️ SUPERSEDED by ${chain.currentPart}\nClick to view chain.`}
            >
                <RefreshCw size={10} className="animate-pulse-slow" />
                <Typography variant="label" className="hidden sm:inline group-hover:underline decoration-dashed">Old</Typography>
            </div>
        );
    }

    if (isCurrent) {
        const predecessorCount = chain.obsoleteParts.length;
        return (
            <div
                onClick={handleClick}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 cursor-pointer hover:bg-emerald-100 hover:border-emerald-300 transition-all group"
                title={`✓ CURRENT PART\nReplaces ${predecessorCount} older codes.\nClick to view chain.`}
            >
                <Link size={10} />
                <Typography variant="label" className="hidden sm:inline group-hover:underline decoration-dashed">Current</Typography>
            </div>
        );
    }

    return null;
};
