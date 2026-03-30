
import React from 'react';
import { Typography } from './Typography';

// Modern Gradient Palette Map aligned with ATP Design Tokens
const styleConfig = {
  blue: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/10',
    cardBg: 'bg-gradient-blue border-white/10',
    cardBorder: 'border-white/10',
    cardHoverBorder: 'group-hover:border-white/30',
    cardGlow: 'shadow-glow-blue',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'bg-atp-accent/50',
    innerGlow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
  },
  emerald: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/10',
    cardBg: 'bg-gradient-emerald border-white/10',
    cardBorder: 'border-white/10',
    cardHoverBorder: 'group-hover:border-white/30',
    cardGlow: 'shadow-glow-emerald',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'bg-emerald-400/50',
    innerGlow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
  },
  rose: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/10',
    cardBg: 'bg-gradient-rose border-white/10',
    cardBorder: 'border-white/10',
    cardHoverBorder: 'group-hover:border-white/30',
    cardGlow: 'shadow-glow-rose',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'bg-rose-400/50',
    innerGlow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
  },
  amber: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/10',
    cardBg: 'bg-gradient-amber border-white/10',
    cardBorder: 'border-white/10',
    cardHoverBorder: 'group-hover:border-white/30',
    cardGlow: 'shadow-glow-amber',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'bg-amber-400/50',
    innerGlow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]',
  },
  slate: {
    iconBg: 'bg-white/20 shadow-lg shadow-slate-900/10',
    cardBg: 'bg-atp-secondary border-white/10',
    cardBorder: 'border-white/10',
    cardHoverBorder: 'group-hover:border-white/30',
    cardGlow: 'shadow-glass',
    valueText: 'text-white',
    labelText: 'text-slate-100',
    subText: 'text-slate-300',
    accentLine: 'bg-slate-400/50',
    innerGlow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]',
  },
  professional: {
    iconBg: 'bg-white/10 shadow-lg shadow-slate-900/20',
    cardBg: 'bg-gradient-professional border-white/10',
    cardBorder: 'border-white/10',
    cardHoverBorder: 'group-hover:border-white/30',
    cardGlow: 'shadow-glow-blue',
    valueText: 'text-white',
    labelText: 'text-[#F5F5F5]',
    subText: 'text-[#E2E8F0]',
    accentLine: 'bg-atp-accent/50',
    innerGlow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]',
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

  const badgeClasses = badgeColor === 'red'
    ? 'bg-white/20 text-white border-white/30'
    : badgeColor === 'emerald'
      ? 'bg-white/20 text-white border-white/30'
      : 'bg-white/20 text-white border-white/30';

  return (
    <div
      onClick={onClick}
      className={`
        group relative p-3 sm:p-4 rounded-2xl border transition-all duration-300 overflow-hidden
        ${style.cardBg} ${style.cardGlow} ${style.innerGlow}
        ${isActive
          ? 'ring-2 ring-white/50 translate-y-[-2px] border-white/40'
          : 'border-white/10 hover:border-white/20 hover:translate-y-[-2px] shadow-sm'}
        ${onClick ? 'cursor-pointer' : ''}
      `}
    >
      {/* Decorative glow orb - Enhanced with dynamic movement */}
      <div className="absolute -top-8 -right-8 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 group-hover:scale-150 group-hover:-translate-x-4 group-hover:translate-y-4 transition-all duration-700 pointer-events-none"></div>

      <div className="relative z-10 flex items-center gap-2 sm:gap-3">
        {/* Icon - Added rotation and scale */}
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-sm sm:text-base text-white ${style.iconBg} transition-all group-hover:scale-110 group-hover:rotate-12 duration-300`}>
          <i className={`fas ${icon}`}></i>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <Typography variant="label" className={`${style.labelText} metric-label truncate block !text-[9px] sm:!text-[10px]`}>
            {label}
          </Typography>
          <Typography variant="h2" className={`tracking-tight leading-tight ${style.valueText} !text-base sm:!text-xl truncate`}>
            {value}
          </Typography>
          <Typography variant="body-sm" className={`truncate ${style.subText} trend-value !text-[11px] sm:!text-xs opacity-80`}>
            {subValue}
          </Typography>
        </div>

        {/* Badge / Trend */}
        {badge ? (
          <Typography variant="label" className={`px-2 py-0.5 rounded-lg border animate-pulse shadow-sm flex-shrink-0 ${badgeClasses} hidden xs:block`}>
            {badge}
          </Typography>
        ) : trend && (
          <div className={`px-2 py-1 rounded-lg flex items-center gap-1 bg-white/15 border border-white/20 flex-shrink-0 hidden xs:flex ${trend.direction === 'up' ? 'text-emerald-200' :
            trend.direction === 'down' ? 'text-rose-200' : 'text-white/70'
            }`}>
            {(trend.direction === 'up' || trend.direction === 'down') && (
              <i className={`fas fa-arrow-${trend.direction} text-[8px]`}></i>
            )}
            <Typography variant="label" className="inherit-color !text-[9px]">
              {trend.value}
            </Typography>
          </div>
        )}
      </div>

      {/* Decorative accent line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden">
        <div className={`h-full w-full ${style.accentLine} opacity-60`}></div>
      </div>
    </div>
  );
});
