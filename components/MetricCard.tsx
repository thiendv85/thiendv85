
import React from 'react';
import { Typography } from './Typography';

import { FaIcon } from './Icon';
// Modern Gradient Palette Map aligned with ATP Design Tokens
const styleConfig = {
  blue: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/10 md:shadow-lg',
    cardBg: 'bg-gradient-blue border-white/10',
    cardGlow: 'max-md:!shadow-none shadow-glow-blue',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'max-md:hidden bg-atp-accent/50',
    innerGlow: 'max-md:!shadow-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
  },
  emerald: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/10 md:shadow-lg',
    cardBg: 'bg-gradient-emerald border-white/10',
    cardGlow: 'max-md:!shadow-none shadow-glow-emerald',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'max-md:hidden bg-emerald-400/50',
    innerGlow: 'max-md:!shadow-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
  },
  rose: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/10 md:shadow-lg',
    cardBg: 'bg-gradient-rose border-white/10',
    cardGlow: 'max-md:!shadow-none shadow-glow-rose',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'max-md:hidden bg-rose-400/50',
    innerGlow: 'max-md:!shadow-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
  },
  amber: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/10 md:shadow-lg',
    cardBg: 'bg-gradient-amber border-white/10',
    cardGlow: 'max-md:!shadow-none shadow-glow-amber',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'max-md:hidden bg-amber-400/50',
    innerGlow: 'max-md:!shadow-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
  },
  slate: {
    iconBg: 'bg-white/20 shadow-lg shadow-slate-900/10 md:shadow-lg',
    cardBg: 'bg-atp-secondary max-md:bg-slate-800 border-white/10',
    cardGlow: 'max-md:!shadow-none shadow-glass',
    valueText: 'text-white',
    labelText: 'text-slate-100',
    subText: 'text-slate-300',
    accentLine: 'max-md:hidden bg-slate-400/50',
    innerGlow: 'max-md:!shadow-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]',
  },
  professional: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/20 md:shadow-lg',
    cardBg: 'bg-gradient-professional border-white/10',
    cardGlow: 'max-md:!shadow-none shadow-glow-blue',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'max-md:hidden bg-atp-accent/50',
    innerGlow: 'max-md:!shadow-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]',
  },
};

type ColorKey = keyof typeof styleConfig;

interface MetricCardProps {
  label: string;
  value: string;
  subValue: string;
  icon: string;
  color: ColorKey;
  onClick?: () => void;
  isActive?: boolean;
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
  badge?: string | null;
  badgeColor?: 'red' | 'blue' | 'emerald';
}

export const MetricCard = React.memo(({ label, value, subValue, icon, color = 'slate', onClick, isActive, trend, badge, badgeColor }: MetricCardProps) => {
  const style = styleConfig[color] || styleConfig.slate;

  const badgeClasses = 'bg-white/20 text-white border-white/30';

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Chi tiết số liệu ${label}: ${value}`}
      className={`
        group relative overflow-hidden border transition-all duration-300 rounded-2xl
        ${style.cardBg} ${style.cardGlow} ${style.innerGlow}
        ${isActive
          ? 'ring-2 ring-white/50 translate-y-[-2px] border-white/40'
          : 'border-white/10 hover:border-white/20 hover:translate-y-[-2px] shadow-sm'}
        ${onClick ? 'cursor-pointer focus:outline-none focus:ring-4 focus:ring-white/30' : ''}
      `}
    >
      {/* Decorative glow orb (hidden on mobile flat design) */}
      <div className="hidden md:block absolute -top-8 -right-8 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 group-hover:scale-150 transition-all duration-700 pointer-events-none" />

      {/* === MOBILE: compact horizontal row (< 768px) === */}
      <div className="md:hidden relative z-10 flex items-center gap-3 px-3 py-3 min-h-[56px]">
        <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-base text-white ${style.iconBg}`}>
          <FaIcon className={`fas ${icon}`}  />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[9px] font-black uppercase tracking-widest leading-none mb-0.5 opacity-80 ${style.labelText}`}>{label}</div>
          <div className={`text-base font-black leading-tight truncate tabular-nums ${style.valueText}`}>{value}</div>
          <div className={`text-[10px] font-bold truncate opacity-70 ${style.subText}`}>{subValue}</div>
        </div>
        {badge && (
          <div className={`text-[9px] font-black px-1.5 py-0.5 rounded border flex-shrink-0 ${badgeClasses}`}>{badge}</div>
        )}
      </div>

      {/* === DESKTOP: original vertical layout (>= 768px) === */}
      <div className="hidden md:block relative z-10 p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-base text-white ${style.iconBg} transition-all group-hover:scale-110 group-hover:rotate-12 duration-300`}>
            <FaIcon className={`fas ${icon}`}  />
          </div>
          <div className="flex-1 min-w-0">
            <Typography variant="label" className={`${style.labelText} metric-label truncate block !text-[10px]`}>
              {label}
            </Typography>
            <Typography variant="h2" className={`tracking-tight leading-tight ${style.valueText} !text-xl truncate tabular-nums`}>
              {value}
            </Typography>
            <Typography variant="body-sm" className={`truncate ${style.subText} trend-value !text-xs opacity-80`}>
              {subValue}
            </Typography>
          </div>
          {badge ? (
            <Typography variant="label" className={`px-2 py-0.5 rounded-lg border animate-pulse shadow-sm flex-shrink-0 ${badgeClasses}`}>
              {badge}
            </Typography>
          ) : trend && (
            <div className={`px-2 py-1 rounded-lg flex items-center gap-1 bg-white/15 border border-white/20 flex-shrink-0 ${
              trend.direction === 'up' ? 'text-emerald-200' :
              trend.direction === 'down' ? 'text-rose-200' : 'text-white/70'
            }`}>
              {(trend.direction === 'up' || trend.direction === 'down') && (
                <FaIcon className={`fas fa-arrow-${trend.direction} text-[8px]`}  />
              )}
              <Typography variant="label" className="inherit-color !text-[9px]">
                {trend.value}
              </Typography>
            </div>
          )}
        </div>
      </div>

      {/* Accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden">
        <div className={`h-full w-full ${style.accentLine} opacity-60`} />
      </div>
    </div>
  );
});
