import React from 'react';
import { FaIcon } from '../../components/Icon';

export interface MetricCardProps {
    label: string;
    value: string;
    sub?: string;
    icon: string;
    onClick?: () => void;
    isActive?: boolean;
}

// MetricCard — Bento Light Luxury spec: flat surface-raised tile, no gradient.
// Active state: ring with ink border instead of lift.
export const MetricCard = ({ label, value, sub, icon, onClick, isActive }: MetricCardProps) => {
    return (
        <div
            onClick={onClick}
            style={{
                background: '#FFFFFF',
                border: `1px solid ${isActive ? '#15181E' : '#E6E1D8'}`,
                borderRadius: 14,
                padding: 16,
                boxShadow: isActive
                    ? '0 0 0 3px rgba(21, 24, 30, 0.08), 0 1px 2px rgba(15, 17, 22, 0.05), 0 12px 32px -16px rgba(15, 17, 22, 0.10)'
                    : '0 1px 2px rgba(15, 17, 22, 0.05), 0 12px 32px -16px rgba(15, 17, 22, 0.10)',
                cursor: 'pointer',
                transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 160ms ease',
                fontFamily: "'Inter', system-ui, sans-serif",
                color: '#15181E',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
            }}
            onMouseEnter={e => {
                if (!isActive) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.borderColor = '#15181E';
                }
            }}
            onMouseLeave={e => {
                if (!isActive) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = '#E6E1D8';
                }
            }}
        >
            <div
                style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#EFECE6',
                    color: '#15181E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                }}
            >
                <FaIcon className={`fas ${icon}`} aria-hidden="true" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <span
                    style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        lineHeight: 1.1,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: '#5B6470',
                        marginBottom: 4,
                    }}
                >
                    {label}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span
                        style={{
                            fontFamily: "'Fraunces', ui-serif, Georgia, serif",
                            fontSize: '1.5rem',
                            fontWeight: 600,
                            lineHeight: 1,
                            letterSpacing: '-0.015em',
                            color: '#15181E',
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    >
                        {value}
                    </span>
                    <span
                        style={{
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#5B6470',
                            textTransform: 'uppercase',
                            letterSpacing: '0.18em',
                        }}
                    >
                        tr
                    </span>
                </div>
                {sub && (
                    <span
                        style={{
                            display: 'block',
                            marginTop: 4,
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            color: '#5B6470',
                        }}
                    >
                        {sub}
                    </span>
                )}
            </div>
        </div>
    );
};
