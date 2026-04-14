
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { InventoryItem, DashboardSettings, InventoryFilters, COST_RANGES, FOB_COST_RANGES, DEBT_STATUS_OPTIONS, LOIS_DESCRIPTIONS, DEFAULT_SOURCE_PROFILES } from '../types/inventory';
import { useLanguage } from '../utils/i18n';
import { useDevice } from '../hooks/useDevice';

interface FilterPanelProps {
  data: InventoryItem[];
  settings: DashboardSettings;
  onSettingsChange: (settings: DashboardSettings) => void;
  filters: InventoryFilters;
  onFiltersChange: (filters: InventoryFilters) => void;
  sourceName?: string;  // e.g. "NB – Nhật Bản"
}

const SpecialFilterButton = ({ label, icon, isActive, onClick }: { label: string, icon: string, isActive: boolean, onClick: () => void }) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all shadow-sm border h-8 uppercase tracking-wide ${isActive ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>
    <i className={`fas ${icon} ${isActive ? 'text-white' : 'text-slate-400'}`}></i>
    <span className="hidden sm:inline">{label}</span>
  </button>
);

export const FilterPanel = React.memo(({ data, settings, onSettingsChange, filters, onFiltersChange, sourceName }: FilterPanelProps) => {
  const { t } = useLanguage();
  const loisGroups = useMemo(() => Array.from(new Set(data.map(item => item.LOISGroup).filter(Boolean))).sort(), [data]);
  const trendFlags = useMemo(() => Array.from(new Set(data.map(item => item.TrendFlag).filter(Boolean))).sort(), [data]);
  const uniqueSources = useMemo(() => {
    return Array.from(new Set(data.map(i => `${i.BrandName || 'Kia'}|${i.SourceId || ''}`)))
      .map(key => {
        const [brand, sid] = key.split('|');
        const profile = settings.sourceProfiles?.find(p =>
          p.brand.toLowerCase() === brand.toLowerCase() &&
          (p.id.toUpperCase() === sid.toUpperCase() || p.name.toLowerCase().includes(sid.toLowerCase()))
        );
        return {
          id: key,
          label: `${brand} - ${profile?.name || sid || 'General'}`,
          brand,
          sid: sid || 'GEN'
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, settings.sourceProfiles]);

  const getSelectClass = (isActive: boolean) => {
    const base = "w-full cursor-pointer px-3 py-1 bg-white border rounded-xl text-xs font-black focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none h-9 shadow-sm transition-all uppercase tracking-tighter appearance-none transition-all duration-200";
    return isActive ? `${base} border-blue-600 text-blue-800 bg-blue-50/50` : `${base} border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700`;
  };

  const toggleDebtStatus = (statusId: string) => {
    const current = filters.debtStatus || [];
    const next = current.includes(statusId)
      ? current.filter(id => id !== statusId)
      : [...current, statusId];
    onFiltersChange({ ...filters, debtStatus: next });
  };

  const toggleLois = (lois: string) => {
    const current = filters.lois || [];
    const next = current.includes(lois)
      ? current.filter(id => id !== lois)
      : [...current, lois];
    onFiltersChange({ ...filters, lois: next });
  };

  const toggleAllLois = () => {
    onFiltersChange({ ...filters, lois: [] });
  };

  const { isMobile } = useDevice();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Count active filters for badge
  const activeFilterCount = [
    filters.priority !== 'All',
    (filters.lois || []).length > 0,
    filters.source !== 'All',
    filters.status !== 'All',
    filters.trend !== 'All',
    filters.costRange > 0,
    filters.fobCostRange > 0,
    filters.showBackorders,
    !!filters.specialFilter,
    (filters.debtStatus || []).length > 0,
  ].filter(Boolean).length;

  // The full filter panel content — shared between desktop inline and mobile drawer
  const filterBody = (
    <div className="bg-white p-2.5 sm:p-3.5 rounded-3xl shadow-soft hover:shadow-medium border border-slate-200/60 transition-all space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* LEFT COLUMN: FILTERS (8/12) */}
        <div className="lg:col-span-8 space-y-3">
          <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
            <div>
              <label className="block text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mb-1.5">{t('filter_scope')}</label>
              <div className="flex bg-slate-100/60 p-1 rounded-xl h-9 items-center border border-slate-200/50 shadow-inner">
                {['All', 'P1', 'P2', 'P3'].map(p => (
                  <button key={p} onClick={() => onFiltersChange({ ...filters, priority: p as any })} className={`w-full text-xs font-black rounded-lg transition-all h-7 uppercase ${filters.priority === p ? 'bg-white text-blue-700 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-blue-700'}`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mb-1.5">{t('filter_lois')}</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={toggleAllLois}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all uppercase tracking-tighter h-8
                    ${(filters.lois || []).length === 0
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                      : 'bg-white text-slate-400 border-slate-200 hover:border-blue-300 hover:text-blue-700'
                    }`}
                >
                  ALL
                </button>
                {loisGroups.map(g => {
                  const isActive = (filters.lois || []).includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => toggleLois(g)}
                      title={LOIS_DESCRIPTIONS[g]}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all uppercase tracking-tighter h-8
                        ${isActive
                          ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700'
                        }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="relative">
              <label className="block text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mb-1.5">Nguồn Hàng (Source)</label>
              <select value={filters.source} onChange={e => onFiltersChange({ ...filters, source: e.target.value })} className={getSelectClass(filters.source !== 'All')}>
                <option value="All">Tất cả nguồn hàng</option>
                {uniqueSources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <i className="fas fa-chevron-down absolute right-3 bottom-2.5 text-[10px] text-blue-300 pointer-events-none"></i>
            </div>
            <div className="relative">
              <label className="block text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mb-1.5">{t('filter_lifecycle')}</label>
              <select value={filters.status} onChange={e => onFiltersChange({ ...filters, status: e.target.value as any })} className={getSelectClass(filters.status !== 'All')}>
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Sleeping">Sleeping</option>
                <option value="Dead Stock">Dead Stock</option>
              </select>
              <i className="fas fa-chevron-down absolute right-3 bottom-2.5 text-[10px] text-blue-300 pointer-events-none"></i>
            </div>
            <div className="relative">
              <label className="block text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mb-1.5">{t('filter_cost')}</label>
              <select value={filters.costRange} onChange={e => onFiltersChange({ ...filters, costRange: Number(e.target.value) })} className={getSelectClass(filters.costRange > 0)}>
                {COST_RANGES.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
              </select>
              <i className="fas fa-chevron-down absolute right-3 bottom-2.5 text-[10px] text-blue-300 pointer-events-none"></i>
            </div>
            <div className="relative">
              <label className="block text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mb-1.5">{t('filter_trend')}</label>
              <select value={filters.trend} onChange={e => onFiltersChange({ ...filters, trend: e.target.value })} className={getSelectClass(filters.trend !== 'All')}>
                <option value="All">All Trends</option>
                {trendFlags.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <i className="fas fa-chevron-down absolute right-3 bottom-2.5 text-[10px] text-blue-300 pointer-events-none"></i>
            </div>
            <div>
              <label className="block text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mb-1.5">{t('filter_currency')}</label>
              <div className="flex bg-slate-100/60 p-1 rounded-xl h-9 items-center border border-slate-200/50 shadow-inner">
                <button onClick={() => onSettingsChange({ ...settings, costBasis: 'PP' })} className={`w-full text-xs font-black rounded-lg transition-all h-full uppercase ${settings.costBasis === 'PP' ? 'bg-white shadow-sm text-blue-700 border border-slate-100' : 'text-slate-500 hover:text-blue-700'}`}>VND</button>
                <button onClick={() => onSettingsChange({ ...settings, costBasis: 'FOB' })} className={`w-full text-xs font-black rounded-lg transition-all h-full uppercase ${settings.costBasis === 'FOB' ? 'bg-white shadow-sm text-blue-700 border border-slate-100' : 'text-slate-500 hover:text-blue-700'}`}>EURO</button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pt-3 border-t border-slate-100">
            <div className="text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mr-2 flex items-center gap-2.5 min-w-[120px] mb-1 sm:mb-0">
              <i className="fas fa-microchip text-blue-600/80"></i> {t('filter_smart')}:
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full overflow-x-auto no-scrollbar-at-mobile pb-1">
                <SpecialFilterButton label={t('term_backorder')} icon="fa-radiation" isActive={filters.showBackorders} onClick={() => onFiltersChange({ ...filters, showBackorders: !filters.showBackorders })} />
                <SpecialFilterButton label="Stockout (H.Nghiệp)" icon="fa-radiation" isActive={filters.specialFilter === 'critical_stockout'} onClick={() => onFiltersChange({ ...filters, specialFilter: filters.specialFilter === 'critical_stockout' ? 'none' : 'critical_stockout' })} />
                <SpecialFilterButton label={t('term_stockout')} icon="fa-battery-quarter" isActive={filters.specialFilter === 'stockout'} onClick={() => onFiltersChange({ ...filters, specialFilter: filters.specialFilter === 'stockout' ? 'none' : 'stockout' })} />
                <SpecialFilterButton label={t('term_excess')} icon="fa-arrow-down-wide-short" isActive={filters.specialFilter === 'excess'} onClick={() => onFiltersChange({ ...filters, specialFilter: filters.specialFilter === 'excess' ? 'none' : 'excess' })} />
                <SpecialFilterButton label={t('term_has_po')} icon="fa-ship" isActive={filters.specialFilter === 'has_po'} onClick={() => onFiltersChange({ ...filters, specialFilter: filters.specialFilter === 'has_po' ? 'none' : 'has_po' })} />
                <SpecialFilterButton label={t('term_supersession')} icon="fa-exchange-alt" isActive={filters.specialFilter === 'has_supersession'} onClick={() => onFiltersChange({ ...filters, specialFilter: filters.specialFilter === 'has_supersession' ? 'none' : 'has_supersession' })} />
                <SpecialFilterButton label="Cảnh báo" icon="fa-triangle-exclamation" isActive={filters.specialFilter === 'has_warning'} onClick={() => onFiltersChange({ ...filters, specialFilter: filters.specialFilter === 'has_warning' ? 'none' : 'has_warning' })} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-50">
            <div className="text-[10px] font-black text-blue-700/80 uppercase tracking-[0.15em] mr-2 flex items-center gap-2.5 min-w-[150px]">
              <i className="fas fa-truck-loading text-blue-600/80"></i> {t('filter_coverage')}:
            </div>
            <div className="flex flex-wrap gap-2">
              {DEBT_STATUS_OPTIONS.map(opt => {
                const isActive = (filters.debtStatus || []).includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleDebtStatus(opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black border transition-all uppercase tracking-wide
                                        ${isActive
                        ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-700 hover:shadow-sm'
                      }
                                    `}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PLANNING PARAMS (4/12) */}
        <div className="lg:col-span-4 flex flex-col gap-2.5 bg-slate-50/50 p-3 rounded-3xl border border-slate-200 shadow-inner overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-black text-blue-800 uppercase tracking-[0.15em] flex items-center gap-1.5">
              <i className="fas fa-sliders-h text-blue-600/80"></i> {t('Planning Params')}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSettingsChange({ ...settings, applySeasonality: !settings.applySeasonality })}
                className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[9px] font-black transition-all border ${settings.applySeasonality ? 'bg-emerald-600 text-white border-emerald-700 shadow-md shadow-emerald-500/20' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`}
                title="Áp dụng Hệ số Mùa vụ"
              >
                <i className={`fas ${settings.applySeasonality ? 'fa-calendar-check' : 'fa-calendar-circle-minus'}`}></i>
                {settings.applySeasonality ? 'MÙA VỤ: ON' : 'MÙA VỤ: OFF'}
              </button>
              <button
                onClick={() => {
                  const resetProfiles = settings.sourceProfiles?.map(p => {
                    const def = DEFAULT_SOURCE_PROFILES.find(d => d.id.toUpperCase() === p.id.toUpperCase());
                    return {
                      ...p,
                      lt: def?.lt ?? 90,
                      sp: def?.sp ?? 30,
                      ssp: def?.ssp ?? 15
                    };
                  });
                  onSettingsChange({
                    ...settings,
                    params: { lt: 90, sp: 30, ssp: 15 },
                    sourceProfiles: resetProfiles
                  });
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm group active:scale-95"
                title="Reset to Defaults"
              >
                <i className="fas fa-undo text-[10px] group-active:rotate-[-90deg] transition-transform"></i>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1 customer-scrollbar">
            {(() => {
              const uniqueSources = Array.from(new Set(data.map(i => `${i.BrandName || 'Kia'}|${i.SourceId || ''}`)))
                .map(key => {
                  const [brand, sid] = key.split('|');
                  return { brand, sid };
                })
                .sort((a, b) => a.brand.localeCompare(b.brand) || a.sid.localeCompare(b.sid));

              if (uniqueSources.length === 0) return null;

              return uniqueSources.map(src => {
                const profile = settings.sourceProfiles?.find(p =>
                  p.brand.toLowerCase() === src.brand.toLowerCase() &&
                  (p.id.toUpperCase() === src.sid.toUpperCase() || p.name.toLowerCase().includes(src.sid.toLowerCase()))
                );

                const defaultProfile = DEFAULT_SOURCE_PROFILES.find(d => d.id.toUpperCase() === src.sid.toUpperCase());
                const valLT = profile?.lt ?? defaultProfile?.lt ?? settings.params.lt;
                const valSP = profile?.sp ?? defaultProfile?.sp ?? settings.params.sp;
                const valSSP = profile?.ssp ?? defaultProfile?.ssp ?? settings.params.ssp;

                const updateProfile = (field: string, value: number) => {
                  if (profile) {
                    const newProfiles = settings.sourceProfiles?.map(p =>
                      p.id === profile.id ? { ...p, [field]: value } : p
                    );
                    onSettingsChange({ ...settings, sourceProfiles: newProfiles });
                  } else if (src.brand || src.sid) {
                    const newProfile: any = {
                      id: src.sid || 'GEN',
                      brand: src.brand || 'Kia',
                      name: `Source ${src.sid}`,
                      lt: field === 'lt' ? value : settings.params.lt,
                      sp: field === 'sp' ? value : settings.params.sp,
                      ssp: field === 'ssp' ? value : settings.params.ssp
                    };
                    onSettingsChange({
                      ...settings,
                      sourceProfiles: [...(settings.sourceProfiles || []), newProfile]
                    });
                  }
                };

                return (
                  <div key={`${src.brand}-${src.sid}`} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 transition-all group shadow-sm hover:border-blue-400">
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-[10px] font-black text-blue-800 uppercase leading-none truncate tracking-tight">
                        {src.brand} - {profile?.name || src.sid || 'General'}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase truncate mt-0.5 opacity-70">
                        ID: {src.sid || 'GEN'}
                      </span>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {[
                        { id: 'lt', val: valLT, label: 'LT' },
                        { id: 'sp', val: valSP, label: 'SP' },
                        { id: 'ssp', val: valSSP, label: 'SSP' }
                      ].map(p => (
                        <div key={p.id} className="flex flex-col items-center gap-0.5">
                          <span className="text-[8px] font-black text-blue-700/60 uppercase tracking-tighter">{p.label}</span>
                          <input
                            type="number"
                            className="w-11 bg-blue-50/40 border border-blue-100/50 rounded-lg px-0.5 text-xs font-black text-blue-900 text-center py-1 outline-none focus:bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 font-mono shadow-inner transition-all"
                            value={p.val}
                            onChange={e => updateProfile(p.id, Number(e.target.value))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );

  // Mobile: show compact filter bar + bottom sheet
  if (isMobile) {
    return (
      <>
        {/* Mobile filter trigger bar */}
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-200 px-3 py-2.5 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex-1 flex items-center gap-2.5 min-h-[36px]"
          >
            <i className="fas fa-sliders text-blue-600 text-sm" />
            <span className="font-black text-slate-700 text-xs uppercase tracking-wider">Bộ lọc</span>
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">{activeFilterCount}</span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() => onFiltersChange({ priority: 'All', lois: [], status: 'All', source: 'All', trend: 'All', costRange: 0, fobCostRange: 0, showBackorders: false, specialFilter: null, debtStatus: [], search: filters.search })}
              className="text-[10px] font-black text-rose-500 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Modal Overlay */}
        {mobileOpen && createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setMobileOpen(false)}>
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-md bg-slate-50 rounded-3xl shadow-2xl max-h-[85vh] flex flex-col animate-fadeIn border border-white/20"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-200 bg-white rounded-t-3xl shrink-0">
                <div className="flex items-center gap-2">
                  <i className="fas fa-sliders text-blue-600" />
                  <span className="font-black text-slate-800 text-sm uppercase tracking-wider">Bộ lọc</span>
                  {activeFilterCount > 0 && <span className="bg-blue-600 text-white text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">{activeFilterCount}</span>}
                </div>
                <button onClick={() => setMobileOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                  <i className="fas fa-xmark text-sm" />
                </button>
              </div>
              {/* Modal scrollable body */}
              <div className="overflow-y-auto custom-scrollbar flex-1 p-4 space-y-1">
                {filterBody}
              </div>
              {/* Modal footer */}
              <div className="p-4 border-t border-slate-200 bg-white rounded-b-3xl shrink-0">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-2xl text-sm uppercase tracking-widest shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
                >
                  Áp dụng bộ lọc
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  // Desktop: render inline
  return filterBody;
});
