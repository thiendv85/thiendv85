import React, { useMemo } from 'react';
import { ANOMALY_META, type OrderAnomaly } from '../utils/supplierAnomaly';
import type { InventoryItem } from '../types/inventory';

/**
 * CriticalSkuSpotlight — strictly follows design-system/pages/backorder.md
 * (Bento Light Luxury, ATP Backorder). All visual values are inline because
 * the page does not yet have the .bo-page wrapper that scopes the bo-* CSS.
 *
 * Spec compliance:
 *   • bento-tile container (surface-raised + rounded.lg + padding 20px)
 *   • metric-card per SKU (surface-raised + rounded.md + padding 16px)
 *   • Fraunces for headings & metrics; Inter for body; JetBrains Mono for numerics
 *   • Anomaly tier maps to aging tier semantics (monotonic saturation)
 *   • ETA badge maps to status semantics (status-stock / status-po / status-gap)
 *   • No gradient backgrounds, no glass blur, no emoji
 *   • Hover ≤ 2px translate, transform/opacity only (no layout animation)
 */

interface ItemAnomalyAggregate {
  worst: OrderAnomaly;
  maxScore: number;
  maxDaysOpen: number;
  maxDaysOverdue: number;
  abnormalCount: number;
  totalQtyAbnormal: number;
}

interface ItemAnomalyResult {
  aggregate: ItemAnomalyAggregate;
}

// ─── Tokens (verbatim from design-system/pages/backorder.md frontmatter) ───
const T = {
  surface:        '#F7F5F2',
  surfaceRaised:  '#FFFFFF',
  surfaceSunken:  '#EFECE6',
  surfaceInk:     '#0E1116',
  ink:            '#15181E',
  inkMuted:       '#5B6470',
  inkSoft:        '#8A93A0',
  hairline:       '#E6E1D8',
  accent:         '#B8422E',
  dataBlue:       '#2F5BD6',
  dataBlueSoft:   '#DDE6FA',
  ok:             '#146346',
  okSoft:         '#D6ECDF',
  warn:           '#8A5A14',
  warnSoft:       '#FBEDC9',
  danger:         '#9A2D2D',
  dangerSoft:     '#F4D8D2',
  aging30:        '#5B6470',
  aging60:        '#8A5A14',
  aging90:        '#9A2D2D',
  agingOver90:    '#6B1717',
  agingNeutralBg: '#EEF0F4',
} as const;

const FONT_DISPLAY = "'Fraunces', ui-serif, Georgia, serif";
const FONT_BODY    = "'Inter', system-ui, -apple-system, sans-serif";
const FONT_MONO    = "'JetBrains Mono', ui-monospace, Menlo, monospace";

// shadow-tile from spec elevation block
const SHADOW_TILE  = '0 1px 2px rgba(15, 17, 22, 0.05), 0 12px 32px -16px rgba(15, 17, 22, 0.10)';
const SHADOW_HOVER = '0 1px 2px rgba(15, 17, 22, 0.08), 0 14px 32px -14px rgba(15, 17, 22, 0.18)';

// ─── ETA computation ───
type EtaTone = 'stock' | 'po' | 'far' | 'gap';

interface NextEtaInfo {
  label: string;
  tone: EtaTone;
}

function pickEarliestPipelineMonth(pipeline: Record<string, number> | undefined, now: number): number | null {
  if (!pipeline) return null;
  let earliest: number | null = null;
  for (const key of Object.keys(pipeline)) {
    const qty = pipeline[key];
    if (!qty || qty <= 0) continue;
    const m = /^(\d{4})-(\d{1,2})$/.exec(key);
    if (!m) continue;
    const start = new Date(+m[1], +m[2] - 1, 1).getTime();
    const end = new Date(+m[1], +m[2], 0).getTime();
    if (end >= now && (earliest === null || start < earliest)) earliest = start;
  }
  return earliest;
}

export function computeNextEta(item: InventoryItem, now: number = Date.now()): NextEtaInfo {
  const pThis = item.computed?.incomingCurrentMonth || 0;
  const pNext = item.computed?.incomingNextMonth || 0;

  // Only use Pipeline (confirmed PO/invoice) data — not BO ETA (order dates, unreliable)
  if (pThis > 0) return { label: `Tháng này · ${pThis}`, tone: 'stock' };
  if (pNext > 0) return { label: `Tháng sau · ${pNext}`,  tone: 'po' };

  const pm = pickEarliestPipelineMonth(item.Pipeline, now);
  if (pm !== null) {
    const d = new Date(pm);
    return { label: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, tone: 'far' };
  }

  // No pipeline data at all → show "Chưa có invoice" + total BO qty
  const boQty = item.Backorder || 0;
  return { label: `Chưa có invoice · ${boQty}`, tone: 'gap' };
}

// ─── Semantic mappings (per spec) ───
// Anomaly tier maps to AGING semantic — monotonic severity
const ANOMALY_BADGE: Record<OrderAnomaly, { bg: string; color: string; label: string }> = {
  CRITICAL: { bg: T.dangerSoft,     color: T.agingOver90, label: 'Trễ nghiêm trọng' },
  HIGH:     { bg: T.dangerSoft,     color: T.aging90,     label: 'Trễ nặng' },
  WARNING:  { bg: T.warnSoft,       color: T.aging60,     label: 'Trễ nhẹ' },
  DUE_SOON: { bg: T.agingNeutralBg, color: T.aging30,     label: 'Sắp đến hạn' },
  NORMAL:   { bg: T.okSoft,         color: T.ok,          label: 'Bình thường' },
};

// ETA tone maps to STATUS semantic
const ETA_BADGE: Record<EtaTone, { bg: string; color: string }> = {
  stock: { bg: T.okSoft,       color: T.ok },         // status-stock
  po:    { bg: T.dataBlueSoft, color: T.dataBlue },   // status-po
  far:   { bg: T.warnSoft,     color: T.warn },       // far month — warn tone
  gap:   { bg: T.dangerSoft,   color: T.danger },     // status-gap
};

// ─── Typography helpers (per spec scales) ───
const labelCaps: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: '0.8125rem',
  fontWeight: 700,
  lineHeight: 1.1,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
};

const monoStyle: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
};

// Pill (badge-aging-* / status-*) per spec components
const pill = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 6,
  background: bg,
  color,
  fontFamily: FONT_BODY,
  fontSize: '0.8125rem',
  fontWeight: 700,
  lineHeight: 1.1,
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
});

interface Props {
  items: InventoryItem[];
  getAnomaly: (item: InventoryItem) => ItemAnomalyResult;
  getBoQty: (item: InventoryItem) => number;
  onSelect: (item: InventoryItem) => void;
  topN?: number;
}

export const CriticalSkuSpotlight: React.FC<Props> = ({
  items, getAnomaly, getBoQty, onSelect, topN = 15,
}) => {
  const ranked = useMemo(() => {
    const now = Date.now();
    const enriched = items.map(item => {
      const agg = getAnomaly(item).aggregate;
      const eta = computeNextEta(item, now);
      const qty = getBoQty(item);
      return { item, agg, eta, qty };
    });
    // Sort by days overdue vs LT (most overdue first), tiebreak by BO qty
    enriched.sort((a, b) => {
      if (b.agg.maxDaysOverdue !== a.agg.maxDaysOverdue) return b.agg.maxDaysOverdue - a.agg.maxDaysOverdue;
      return b.qty - a.qty;
    });
    return enriched.filter(e => {
      if (e.agg.abnormalCount <= 0 || e.qty <= 0) return false;
      // Skip SKU if incoming this month already covers all BO — no longer critical
      const incomingThisMonth = e.item.computed?.incomingCurrentMonth || 0;
      if (incomingThisMonth >= e.qty) return false;
      return true;
    }).slice(0, topN);
  }, [items, getAnomaly, getBoQty, topN]);

  if (ranked.length === 0) return null;

  return (
    <section
      aria-labelledby="bo-spotlight-heading"
      style={{
        // bento-tile: surface-raised + rounded.lg + padding 20px
        background: T.surfaceRaised,
        border: `1px solid ${T.hairline}`,
        borderRadius: 20,
        padding: 20,
        boxShadow: SHADOW_TILE,
        fontFamily: FONT_BODY,
        color: T.ink,
      }}
    >
      {/* Header — eyebrow + h1 (Fraunces) per spec */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
          paddingBottom: 16,
          borderBottom: `1px solid ${T.hairline}`,
        }}
      >
        <div>
          <span style={{ ...labelCaps, color: T.inkMuted }}>
            Spotlight · Bất cập cần xử lý
          </span>
          <h2
            id="bo-spotlight-heading"
            style={{
              margin: '6px 0 0',
              fontFamily: FONT_DISPLAY,
              fontSize: '1.25rem',          // h2 — matrix-section title per spec
              fontWeight: 600,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              color: T.ink,
            }}
          >
            Top {ranked.length} mã hàng cần ưu tiên
          </h2>
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: FONT_BODY,
              fontSize: '0.875rem',          // body-sm
              fontWeight: 500,
              lineHeight: 1.45,
              color: T.inkMuted,
            }}
          >
            Sắp xếp theo điểm bất thường giảm dần · Bấm 1 thẻ để mở chi tiết
          </p>
        </div>
        <span style={{ ...labelCaps, color: T.inkSoft }}>
          Sort · trễ so LT desc
        </span>
      </header>

      {/* Grid — auto-fill, dense ops surface per spec rationale */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {ranked.map(({ item, agg, eta, qty }, idx) => {
          const ab = ANOMALY_BADGE[agg.worst];
          const eb = ETA_BADGE[eta.tone];
          const rank = idx + 1;
          return (
            <button
              key={item.ItemCode}
              onClick={() => onSelect(item)}
              style={{
                // metric-card: surface-raised + rounded.md + padding 16px
                position: 'relative',
                background: T.surfaceRaised,
                border: `1px solid ${T.hairline}`,
                borderRadius: 14,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: FONT_BODY,
                color: T.ink,
                transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 160ms ease',
              }}
              onMouseEnter={(e) => {
                // Hover: ≤ 2px translate, only transform — per spec
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.borderColor = T.ink;
                e.currentTarget.style.boxShadow = SHADOW_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = T.hairline;
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Rank badge — top-left corner */}
              <div
                style={{
                  position: 'absolute',
                  top: -6,
                  left: -6,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: rank <= 3 ? T.accent : rank <= 7 ? T.ink : T.inkMuted,
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT_MONO,
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  zIndex: 1,
                }}
                aria-label={`Hạng ${rank}`}
              >
                {rank}
              </div>

              {/* Top row: anomaly badge + score */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span style={pill(ab.bg, ab.color)}>{ab.label}</span>
                <span style={{ ...monoStyle, fontSize: '0.8125rem', color: T.inkSoft }}>
                  {Math.round(agg.maxScore)}/100
                </span>
              </div>

              {/* Identity: ItemCode (mono) + ItemName (display serif h2) */}
              <div>
                <div style={{ ...monoStyle, fontSize: '0.8125rem', color: T.inkSoft, letterSpacing: '0.04em' }}>
                  {item.ItemCode}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontFamily: FONT_BODY,        // body-md per spec — not display
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    lineHeight: 1.4,
                    color: T.ink,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {item.ItemName || '(Chưa có tên)'}
                </div>
              </div>

              {/* Hero metric: SL nợ (metric-md Fraunces) + ETA pill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontSize: '1.5rem',          // metric-md per spec
                      fontWeight: 600,
                      lineHeight: 1,
                      letterSpacing: '-0.015em',
                      color: T.ink,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {qty.toLocaleString('vi-VN')}
                  </span>
                  <span style={{ ...labelCaps, color: T.inkMuted, fontSize: '0.75rem' }}>
                    SL nợ
                  </span>
                </div>
                <span style={pill(eb.bg, eb.color)} title={`Bao giờ có hàng: ${eta.label}`}>
                  <span style={{ textTransform: 'none', letterSpacing: 0 }}>{eta.label}</span>
                </span>
              </div>

              {/* Footer — body-sm metadata */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 10,
                  borderTop: `1px solid ${T.hairline}`,
                  fontFamily: FONT_BODY,
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: T.inkMuted,
                  lineHeight: 1.3,
                }}
              >
                <span>{(item.BackorderBreakdown?.length || 0)} đơn · {agg.abnormalCount} bất cập</span>
                <span>Trễ so LT: {Math.round(agg.maxDaysOverdue)}d</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
