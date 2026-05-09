import type { TransformedBOData } from './transform';
import type { Annotation, CompositeKey } from './types';
import { compositeKey } from './types';

const CATEGORY_RANK: Readonly<Record<string, number>> = Object.freeze({
  'Khẩn VOR': 1,
  'Bảo hành': 2,
  'Khẩn': 3,
  'Dự trữ': 4,
});

export function getCategoryRank(opropertyName: string): number {
  return CATEGORY_RANK[opropertyName] ?? 5;
}

interface CompareCtx {
  annotations?: Map<CompositeKey, Annotation>;
  today?: Date;
  annA?: Annotation;
  annB?: Annotation;
}

function daysSince(iso: string | undefined, today: Date): number {
  if (!iso) return Infinity;
  const ms = today.getTime() - new Date(iso).getTime();
  return ms / 86_400_000;
}

export function comparePriority(
  a: TransformedBOData,
  b: TransformedBOData,
  ctx: CompareCtx = {}
): number {
  const ra = getCategoryRank(a.OPropertyName);
  const rb = getCategoryRank(b.OPropertyName);
  if (ra !== rb) return ra - rb;

  if (a.AgingDays !== b.AgingDays) return b.AgingDays - a.AgingDays;

  const oa = a.DaysUntilETA !== null && a.DaysUntilETA < 0 ? -a.DaysUntilETA : 0;
  const ob = b.DaysUntilETA !== null && b.DaysUntilETA < 0 ? -b.DaysUntilETA : 0;
  if (oa !== ob) return ob - oa;

  const today = ctx.today ?? new Date();
  const annA = ctx.annA ?? ctx.annotations?.get(compositeKey(a.DocNo, a.ItemCode, a.RowId));
  const annB = ctx.annB ?? ctx.annotations?.get(compositeKey(b.DocNo, b.ItemCode, b.RowId));
  const da = daysSince(annA?.last_reminded_at, today);
  const db = daysSince(annB?.last_reminded_at, today);
  if (!isFinite(da) && !isFinite(db)) return 0;
  return db - da;
}

export function sortByPriority(
  rows: TransformedBOData[],
  ctx: CompareCtx = {}
): TransformedBOData[] {
  return [...rows].sort((a, b) => comparePriority(a, b, ctx));
}
