
import React, { useMemo } from 'react';
import { BackorderDetail } from '../types/inventory';
import { BackorderPopup } from './BackorderPopup';
import { Typography } from './Typography';

// Mock i18n for demo
const useLanguage = () => ({
  t: (key: string) => ({
    'spb_act_backorder': 'BACKORDER',
    'spb_act_no_plan': 'NO PLAN',
    'spb_act_order': 'ORDER',
    'spb_act_bo_covered': 'BO COVERED',
    'spb_act_excess': 'EXCESS',
    'spb_act_healthy': 'HEALTHY',
    'spb_avail': 'AVAIL'
  }[key] || key)
});

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

interface StockProgressBarProps {
  current: number;
  rop: number;
  max: number;
  ss?: number;
  onOrder?: number;
  backorder?: number;
  excess?: number;
  draftAdd?: number;
  baseFc?: number;
  incoming?: number;
  breakdown?: BackorderDetail[];
  compact?: boolean; // Dense mode for table rows
}

// Updated Colors to use Tailwind Config Gradients or specific classes
const STOCK_COLORS = {
  CRITICAL: 'bg-gradient-rose',
  LOW: 'bg-gradient-to-r from-rose-400 to-rose-500',
  EXCESS: 'bg-gradient-amber',
  HEALTHY: 'bg-gradient-emerald',
  NO_PLANNING: 'bg-gradient-slate'
} as const;

type ActionTagType =
  | 'BO_CLEARED'
  | 'ROP_MET'
  | 'NO_PLANNING'
  | 'BACKORDER'
  | 'ORDER'
  | 'BO_COVERED'
  | 'EXCESS'
  | 'HEALTHY';

// =============================================================================
// UTILITIES
// =============================================================================

const calculateMetrics = (props: Required<StockProgressBarProps>) => {
  const { current, onOrder, draftAdd, backorder, rop, max, ss, baseFc, excess, incoming } = props;

  const totalWithPO = current + onOrder;
  const totalWithDraft = totalWithPO + draftAdd;
  const inventoryPosition = totalWithPO - backorder;
  const projectedPosition = totalWithDraft - backorder;
  const remainingBO = Math.max(0, backorder - totalWithDraft);
  const isBoCleared = backorder > 0 && remainingBO === 0;
  const isNoPlanning = rop === 0;
  const needsOrder = !isNoPlanning && inventoryPosition < rop;

  const excessVal = excess ?? (
    isNoPlanning ? current : Math.max(0, current - Math.ceil(max))
  );

  return {
    totalWithPO,
    totalWithDraft,
    inventoryPosition,
    projectedPosition,
    remainingBO,
    isBoCleared,
    isNoPlanning,
    needsOrder,
    excessVal,
    backorder
  };
};

const getColorClass = (
  current: number,
  ss: number,
  rop: number,
  backorder: number,
  excessVal: number,
  isNoPlanning: boolean
): string => {
  if (isNoPlanning) return STOCK_COLORS.NO_PLANNING;
  if (backorder > 0 && current < backorder) return STOCK_COLORS.CRITICAL;
  if (current < ss) return STOCK_COLORS.CRITICAL;
  if (current < rop) return STOCK_COLORS.LOW;
  if (excessVal > 0) return STOCK_COLORS.EXCESS;
  return STOCK_COLORS.HEALTHY;
};

const getActionTagType = (
  metrics: ReturnType<typeof calculateMetrics>,
  draftAdd: number,
  rop: number
): ActionTagType => {
  const { isBoCleared, needsOrder, projectedPosition, isNoPlanning, backorder, inventoryPosition, excessVal } = metrics;

  if (draftAdd > 0 && isBoCleared) return 'BO_CLEARED';
  if (draftAdd > 0 && needsOrder && projectedPosition >= rop) return 'ROP_MET';
  if (isNoPlanning) return backorder > 0 ? 'BACKORDER' : 'NO_PLANNING';
  if (needsOrder) return 'ORDER';
  if (backorder > 0 && !needsOrder) return 'BO_COVERED';
  if (excessVal > 0) return 'EXCESS';
  return 'HEALTHY';
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

const ActionTag: React.FC<{
  type: ActionTagType;
  shortageQty?: number;
  excessVal?: number;
  t: (key: string) => string;
}> = ({ type, shortageQty, excessVal, t }) => {
  const configs: Record<ActionTagType, {
    icon: string;
    text: string;
    className: string;
  }> = {
    BO_CLEARED: {
      icon: 'fa-check-double',
      text: 'BO Cleared',
      className: 'text-white bg-gradient-blue border-blue-600 shadow-sm',
    },
    ROP_MET: {
      icon: 'fa-magic',
      text: 'ROP Met',
      className: 'text-blue-700 bg-blue-50 border-blue-200',
    },
    BACKORDER: {
      icon: 'fa-exclamation-triangle',
      text: t('spb_act_backorder'),
      className: 'text-white bg-gradient-rose border-rose-600 shadow-sm'
    },
    NO_PLANNING: {
      icon: 'fa-ban',
      text: t('spb_act_no_plan'),
      className: 'text-slate-600 bg-slate-100 border-slate-200'
    },
    ORDER: {
      icon: 'fa-cart-plus',
      text: `${t('spb_act_order')}: ${shortageQty?.toLocaleString() ?? 0}`,
      className: 'text-rose-700 bg-rose-50 border-rose-200 font-black'
    },
    BO_COVERED: {
      icon: 'fa-shield-check',
      text: t('spb_act_bo_covered'),
      className: 'text-emerald-700 bg-emerald-50 border-emerald-200'
    },
    EXCESS: {
      icon: 'fa-boxes-stacked',
      text: `${t('spb_act_excess')}: ${Math.ceil(excessVal ?? 0).toLocaleString()}`,
      className: 'text-amber-700 bg-amber-50 border-amber-200 font-black'
    },
    HEALTHY: {
      icon: 'fa-circle-check',
      text: t('spb_act_healthy'),
      className: 'text-emerald-700 bg-emerald-50 border-emerald-200'
    }
  };

  const config = configs[type];

  return (
    <Typography
      as="span"
      variant="label"
      className={`${config.className} border px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all duration-300`}
    >
      {config.icon && <i className={`fas ${config.icon} text-2xs`}></i>}
      {config.text}
    </Typography>
  );
};

const StockSegment: React.FC<{
  width: number;
  color: string;
  left: number;
  isFirst: boolean;
  isLast: boolean;
  zIndex: number;
  hasBorder?: boolean;
  label?: string;
}> = ({ width, color, left, isFirst, isLast, zIndex, hasBorder, label }) => (
  <div
    className={`absolute h-full transition-all duration-700 ease-out ${color} ${hasBorder ? 'border-l-2 border-white/50' : ''}`}
    style={{
      left: `${left}%`,
      width: `${width}%`,
      zIndex,
      borderRadius: isFirst && isLast
        ? '6px'
        : isFirst
          ? '6px 0 0 6px'
          : isLast
            ? '0 6px 6px 0'
            : '0'
    }}
    title={label}
  />
);

const PolicyMarker: React.FC<{
  position: number;
  label: string;
  value: number;
  color: string;
  isDashed?: boolean;
  isHighlight?: boolean;
}> = ({ position, label, value, color, isDashed, isHighlight }) => (
  <div
    className="absolute top-0 h-full z-40"
    style={{ left: `${position}%` }}
    title={`${label}: ${Math.ceil(value).toLocaleString()}`}
  >
    <div
      className={`h-full ${isDashed ? 'border-l-[2px] border-dashed' : 'w-[2px]'} ${color} ${isHighlight ? 'opacity-100' : 'opacity-80'}`}
    />
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const StockProgressBar: React.FC<StockProgressBarProps> = (props) => {
  const {
    current,
    rop,
    max,
    ss = 0,
    onOrder = 0,
    backorder = 0,
    excess,
    draftAdd = 0,
    baseFc = 0,
    incoming = 0,
    breakdown = [],
    compact = false
  } = props;

  const { t } = useLanguage();

  const metrics = useMemo(
    () => calculateMetrics({ current, rop, max, ss, onOrder, backorder, excess: excess ?? 0, draftAdd, baseFc, incoming, breakdown }),
    [current, rop, max, ss, onOrder, backorder, excess, draftAdd, baseFc, incoming, breakdown]
  );

  const safeMax = useMemo(
    () => Math.max(max, rop * 1.5, metrics.totalWithDraft, baseFc, 1),
    [max, rop, metrics.totalWithDraft, baseFc]
  );

  const positions = useMemo(() => ({
    rop: (rop / safeMax) * 100,
    ss: (ss / safeMax) * 100,
    max: (max / safeMax) * 100,
    fc: (baseFc / safeMax) * 100
  }), [rop, ss, max, baseFc, safeMax]);

  const widths = useMemo(() => ({
    current: Math.min(100, (current / safeMax) * 100),
    po: Math.min(100 - (current / safeMax) * 100, (onOrder / safeMax) * 100),
    draft: Math.min(
      100 - (current / safeMax) * 100 - (onOrder / safeMax) * 100,
      (draftAdd / safeMax) * 100
    )
  }), [current, onOrder, draftAdd, safeMax]);

  const colorClass = useMemo(
    () => getColorClass(current, ss, rop, backorder, metrics.excessVal, metrics.isNoPlanning),
    [current, ss, rop, backorder, metrics.excessVal, metrics.isNoPlanning]
  );

  const actionTagType = useMemo(
    () => getActionTagType(metrics, draftAdd, rop),
    [metrics, draftAdd, rop]
  );

  const shortageQty = useMemo(
    () => Math.ceil(Math.max(0, rop - metrics.inventoryPosition)),
    [rop, metrics.inventoryPosition]
  );

  const hasPO = onOrder > 0;
  const hasDraft = draftAdd > 0;

  return (
    <div className={`w-full ${compact ? '' : 'mt-2'} group/bar`} role="region" aria-label="Stock status indicator">
      {/* Header */}
      <div className={`flex justify-between items-end ${compact ? 'mb-1' : 'mb-2'}`}>
        <ActionTag
          type={actionTagType}
          shortageQty={shortageQty}
          excessVal={metrics.excessVal}
          t={t}
        />

        {/* Stock numbers — hidden in compact to save space */}
        {!compact && (
          <div className="text-xs font-bold text-slate-500 flex items-center gap-2.5">
            {hasDraft && (
              <>
                <Typography
                  variant="label"
                  className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1.5 border border-blue-100 font-bold"
                  title="Projected Total (Net)"
                >
                  <i className="fas fa-arrow-trend-up text-2xs"></i>
                  <span>{Math.max(0, metrics.projectedPosition).toLocaleString()}</span>
                </Typography>
                <Typography variant="body-sm" className="text-slate-300 !font-light">•</Typography>
              </>
            )}

            <Typography variant="body-sm" className="flex items-center gap-1 text-slate-500 font-semibold" title="Available Physical">
              <i className="fas fa-boxes text-2xs text-slate-400"></i>
              <span>{current.toLocaleString()}</span>
            </Typography>
            <Typography variant="body-sm" className="text-slate-300 !font-light">•</Typography>
            <Typography variant="body-sm" className="flex items-center gap-1 text-slate-500 font-semibold" title="Total PO Pipeline">
              <i className="fas fa-truck text-2xs text-blue-500"></i>
              <span>{onOrder.toLocaleString()}</span>
            </Typography>

            {backorder > 0 && (
              <>
                <Typography variant="body-sm" className="text-slate-300 !font-light">•</Typography>
                <BackorderPopup items={breakdown}>
                  <Typography variant="body-sm" className="text-rose-600 !font-bold flex items-center gap-1.5 cursor-help hover:scale-105 transition-transform" title="Backorder Quantity (Hover for details)">
                    <i className="fas fa-clock text-2xs"></i>
                    <span className="border-b border-dashed border-rose-300">{backorder}</span>
                    {hasDraft && (
                      <Typography
                        as="span"
                        variant="label"
                        className={`px-1.5 py-0.5 rounded border !font-bold ${metrics.remainingBO === 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                      >
                        {metrics.remainingBO === 0 ? '✓' : `${metrics.remainingBO}`}
                      </Typography>
                    )}
                  </Typography>
                </BackorderPopup>
              </>
            )}
          </div>
        )}

        {/* Compact mode: just show available + backorder inline */}
        {compact && (
          <div className="text-[9px] font-bold text-slate-500 flex items-center gap-1">
            <i className="fas fa-boxes text-[8px] text-slate-400"></i>
            <span>{current.toLocaleString()}</span>
            {backorder > 0 && (
              <span className="text-rose-600 font-black">·BO:{backorder}</span>
            )}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div
        className={`relative w-full ${compact ? 'h-3' : 'h-6'} bg-slate-200/40 backdrop-blur-sm rounded-lg overflow-hidden border border-white/20 shadow-inner`}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={`Stock level: ${current} of ${safeMax}`}
      >
        {/* ROP Zone Background */}
        {!metrics.isNoPlanning && (
          <div
            className="absolute h-full bg-rose-50/60 z-0"
            style={{ width: `${positions.rop}%` }}
            aria-hidden="true"
          />
        )}

        {/* Stock Segments */}
        <StockSegment
          width={widths.current}
          color={colorClass}
          left={0}
          isFirst={true}
          isLast={!hasPO && !hasDraft}
          zIndex={20}
          label={`Current Stock: ${current.toLocaleString()}`}
        />

        {!metrics.isNoPlanning && hasPO && (
          <StockSegment
            width={widths.po}
            color="bg-gradient-to-r from-blue-400 to-blue-500"
            left={widths.current}
            isFirst={false}
            isLast={!hasDraft}
            zIndex={10}
            hasBorder
            label={`On Order: ${onOrder.toLocaleString()}`}
          />
        )}

        {!metrics.isNoPlanning && hasDraft && (
          <div
            className="absolute h-full border-l-2 border-white/50 transition-all duration-700 ease-out"
            style={{
              left: `${widths.current + widths.po}%`,
              width: `${widths.draft}%`,
              zIndex: 5,
              borderRadius: '0 6px 6px 0',
              background: 'repeating-linear-gradient(135deg, #bfdbfe 0px, #bfdbfe 4px, #93c5fd 4px, #93c5fd 8px)',
            }}
            title={`Draft Order: ${draftAdd.toLocaleString()}`}
          />
        )}

        {/* Policy Markers */}
        {!metrics.isNoPlanning && (
          <>
            <PolicyMarker position={positions.ss} label="Safety Stock" value={ss} color="bg-white/80" />
            <PolicyMarker position={positions.rop} label="Reorder Point" value={rop} color="bg-rose-500" />
            {baseFc > 0 && (
              <PolicyMarker position={positions.fc} label="Base Forecast" value={baseFc} color="border-amber-500" isDashed isHighlight />
            )}
            <PolicyMarker position={positions.max} label="Stock Max" value={max} color="bg-slate-400" />
          </>
        )}
      </div>

      {/* Metrics Line — hidden in compact mode */}
      {!compact && (
        <div className="flex gap-4 mt-1.5">
          <Typography variant="label" className="text-slate-500">ROP: <Typography as="span" variant="label" className="text-slate-800 !font-bold">{Math.ceil(rop).toLocaleString()}</Typography></Typography>
          <Typography variant="label" className="text-slate-500">Max: <Typography as="span" variant="label" className="text-slate-800 !font-bold">{Math.ceil(max).toLocaleString()}</Typography></Typography>
          {backorder > 0 && <Typography variant="label" className="text-rose-600 !font-bold">BO: {backorder.toLocaleString()}</Typography>}
        </div>
      )}
      {/* Compact: ROP/MAX inline tiny */}
      {compact && (
        <div className="flex gap-2 mt-0.5">
          <span className="text-[9px] text-slate-400">ROP:<span className="text-slate-600 font-bold ml-0.5">{Math.ceil(rop).toLocaleString()}</span></span>
          <span className="text-[9px] text-slate-400">MAX:<span className="text-slate-600 font-bold ml-0.5">{Math.ceil(max).toLocaleString()}</span></span>
        </div>
      )}
    </div>
  );
};
