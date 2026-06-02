import { type ExecStage, STAGE_ORDER } from '../../types/execution';
import { STAGE_LABEL } from './StageBadge';

export type StageFilter = ExecStage | 'OPEN' | 'ALL';

export interface ExecFilters {
  stage: StageFilter;
  supplier: string;
  method: 'AIR' | 'SEA' | 'ALL';
  region: string;
  q: string;
}

interface Props {
  filters: ExecFilters;
  onChange: (next: ExecFilters) => void;
  suppliers: string[];
  regions: string[];
  stageCounts: Record<StageFilter, number>;
}

const SELECT_CLASS =
  'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function ExecutionToolbar({
  filters,
  onChange,
  suppliers,
  regions,
  stageCounts,
}: Props) {
  const chips: { key: StageFilter; label: string }[] = [
    { key: 'OPEN', label: 'Đang chạy' },
    { key: 'ALL', label: 'Tất cả' },
    ...STAGE_ORDER.map((s) => ({ key: s as StageFilter, label: STAGE_LABEL[s] })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder="Tìm PO / khoá NCC / mã…"
          className="min-w-[14rem] flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={filters.supplier}
          onChange={(e) => onChange({ ...filters, supplier: e.target.value })}
          className={SELECT_CLASS}
        >
          <option value="ALL">Tất cả NCC</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={filters.method}
          onChange={(e) =>
            onChange({ ...filters, method: e.target.value as ExecFilters['method'] })
          }
          className={SELECT_CLASS}
        >
          <option value="ALL">Tất cả PT vận chuyển</option>
          <option value="AIR">AIR</option>
          <option value="SEA">SEA</option>
        </select>

        <select
          value={filters.region}
          onChange={(e) => onChange({ ...filters, region: e.target.value })}
          className={SELECT_CLASS}
        >
          <option value="ALL">Tất cả miền</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map(({ key, label }) => {
          const active = filters.stage === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...filters, stage: key })}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{label}</span>
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold ${
                  active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {stageCounts[key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
