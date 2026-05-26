import React from 'react';

// Aging tier badge — Bento Light Luxury spec
// Spec: aging-30 #5B6470 | aging-60 #8A5A14 | aging-90 #9A2D2D | aging-over90 #6B1717
// Monotonic saturation: 90 & >90 share danger-soft surface, only ink darkens.
export const AgingBadge = ({ days, qty }: { days: string; qty: number }) => {
    const getStyle = (d: string): { bg: string; ink: string } => {
        if (d === '>90') return { bg: '#F4D8D2', ink: '#6B1717' }; // aging-over90
        if (d === '90') return { bg: '#F4D8D2', ink: '#9A2D2D' }; // aging-90
        if (d === '60') return { bg: '#FBEDC9', ink: '#8A5A14' }; // aging-60
        return { bg: '#EEF0F4', ink: '#5B6470' }; // aging-30
    };
    const { bg, ink } = getStyle(days);
    return (
        <div className="flex flex-col items-center gap-1 group/aging">
            <span
                className="uppercase"
                style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    color: '#5B6470',
                }}
            >
                {days === '>90' ? '> 90D' : `${days}D`}
            </span>
            <div
                className="text-center"
                style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    minWidth: 44,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: bg,
                    color: ink,
                }}
            >
                {qty > 0 ? qty.toLocaleString() : '–'}
            </div>
        </div>
    );
};
