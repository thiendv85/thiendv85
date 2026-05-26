import React, { useMemo, useState } from 'react';
import { InventoryItem, SourceProfile } from '../types/inventory';
import { useLanguage } from '../utils/i18n';
import { useDevice } from '../hooks/useDevice';
import { useTransferPlan } from '../hooks/useTransferPlan';
import { FilteredTransferItem } from '../utils/transferSmartFilter';
import { FaIcon } from '../components/Icon';
import { parseInventorySearch, matchSearch, SearchResult } from '../utils/searchLogic';

interface InventoryDistributionProps {
    data: InventoryItem[];
    enrichedData?: InventoryItem[];
    isEngineProcessing?: boolean;
    onItemSelect: (item: InventoryItem) => void;
    appSettings: {
        sourceProfiles: SourceProfile[];
    };
}

type SortKey = 'value_desc' | 'qty_desc' | 'mos_asc' | 'benefit_desc' | 'code';
type DirectionFilter = 'ALL' | 'NB_TO_BB' | 'BB_TO_NB';

function formatVND(v: number): string {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
}
const fmtNum = (n: number) => (n || 0).toLocaleString('vi-VN');

export const InventoryDistribution: React.FC<InventoryDistributionProps> = ({
    data,
    enrichedData,
    isEngineProcessing,
    onItemSelect,
    appSettings,
}) => {
    const { t } = useLanguage();
    const { isMobile } = useDevice();

    const {
        filterResult,
        transferMap,
        selectedCodes,
        isSaving,
        lastSaved,
        toggleSelect,
        toggleSelectAll,
        clearSelection,
        exportCSV,
        saveCloud,
    } = useTransferPlan(data, enrichedData);

    const [searchTerm, setSearchTerm] = useState('');
    const searchResult = useMemo<SearchResult>(() => parseInventorySearch(searchTerm), [searchTerm]);
    const [sortKey, setSortKey] = useState<SortKey>('value_desc');
    const [dirFilter, setDirFilter] = useState<DirectionFilter>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    const { nbToBb, bbToNb, stats } = filterResult;

    const allItems = useMemo(() => {
        let items = [...nbToBb.items, ...bbToNb.items];

        if (dirFilter !== 'ALL') {
            items = items.filter(fi => fi.direction === dirFilter);
        }

        if (searchResult.type !== 'EMPTY') {
            items = items.filter(fi => matchSearch(fi.item, searchResult));
        }

        items.sort((a, b) => {
            switch (sortKey) {
                case 'value_desc': return b.transferValue - a.transferValue;
                case 'qty_desc': return b.roundedQty - a.roundedQty;
                case 'benefit_desc': return (b.transfer.transferNetBenefit || 0) - (a.transfer.transferNetBenefit || 0);
                case 'mos_asc': {
                    const mosA = Math.min(a.item.computed?.transfer?.mosNB ?? 99, a.item.computed?.transfer?.mosBB ?? 99);
                    const mosB = Math.min(b.item.computed?.transfer?.mosNB ?? 99, b.item.computed?.transfer?.mosBB ?? 99);
                    return mosA - mosB;
                }
                case 'code': return a.item.ItemCode.localeCompare(b.item.ItemCode);
                default: return 0;
            }
        });

        return items;
    }, [nbToBb, bbToNb, dirFilter, searchResult, sortKey]);

    const totalPages = Math.max(1, Math.ceil(allItems.length / itemsPerPage));
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return allItems.slice(start, start + itemsPerPage);
    }, [allItems, currentPage, itemsPerPage]);

    const handleSave = async () => {
        const brand = data[0]?.BrandName || 'all';
        await saveCloud(brand);
    };

    return (
        <div
            className="bo-page flex flex-col h-full"
            style={{
                background: '#F7F5F2',
                color: '#15181E',
                fontFamily: "'Inter', system-ui, sans-serif",
            }}
        >
            {/* ═══ OBSIDIAN HEADER — feature banner + KPIs ═══ */}
            <div className="px-6 lg:px-8 pt-5 pb-4" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <section className="bo-tile-feature" style={{ padding: '20px 24px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'rgba(244, 226, 180, 0.10)',
                                border: '1px solid rgba(244, 226, 180, 0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <FaIcon className="fas fa-right-left" style={{ color: 'var(--bo-accent)', fontSize: 14 }} />
                            </div>
                            <div>
                                <div className="bo-eyebrow" style={{ fontSize: 11, marginBottom: 2 }}>Inventory Redistribution</div>
                                <h1 style={{
                                    fontFamily: "var(--bo-font-display)",
                                    fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1.1,
                                    color: '#F4F1EB',
                                }}>Điều Phối Tồn Kho</h1>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bo-chip"
                                style={{ background: 'rgba(244, 226, 180, 0.10)', border: '1px solid rgba(244, 226, 180, 0.20)', color: '#F4F1EB' }}
                            >
                                <FaIcon className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} style={{ fontSize: 12 }} />
                                <span>{isSaving ? 'Đang lưu…' : 'Lưu Cloud'}</span>
                            </button>
                            <button
                                onClick={exportCSV}
                                className="bo-chip"
                                style={{ background: 'rgba(244, 226, 180, 0.10)', border: '1px solid rgba(244, 226, 180, 0.20)', color: '#F4F1EB' }}
                            >
                                <FaIcon className="fas fa-file-csv" style={{ fontSize: 12 }} />
                                <span>{selectedCodes.size > 0 ? `Xuất ${selectedCodes.size} mã` : 'Xuất CSV'}</span>
                            </button>
                            {lastSaved && (
                                <span style={{ fontSize: 12, color: 'rgba(244, 241, 235, 0.4)', fontWeight: 700 }}>
                                    <FaIcon className="fas fa-check" style={{ color: 'var(--bo-ok)', marginRight: 4 }} />
                                    {lastSaved}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* KPI row inside obsidian */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                        {([
                            { label: 'Tổng SKU', value: fmtNum(stats.totalSKU), sub: `NB→BB ${nbToBb.skuCount} · BB→NB ${bbToNb.skuCount}` },
                            { label: 'Tổng SL', value: fmtNum(stats.totalQty), sub: `${fmtNum(nbToBb.totalQty)} + ${fmtNum(bbToNb.totalQty)}` },
                            { label: 'Tổng Giá Trị', value: `${formatVND(stats.totalValue)}₫`, sub: `NB→BB ${formatVND(nbToBb.totalValue)} · BB→NB ${formatVND(bbToNb.totalValue)}`, warn: true },
                            { label: 'Lợi Ích Ròng', value: `${formatVND(stats.totalNetBenefit)}₫`, sub: `MOS +${stats.avgMOSImprovement.toFixed(2)} · BO ${(stats.boCoverageRate * 100).toFixed(0)}%`, accent: true },
                        ] as { label: string; value: string; sub: string; accent?: boolean; warn?: boolean }[]).map((t, i) => (
                            <div key={t.label} style={{
                                padding: '0 20px',
                                borderLeft: i > 0 ? '1px solid rgba(244, 226, 180, 0.12)' : 'none',
                            }}>
                                <div style={{
                                    fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
                                    textTransform: 'uppercase' as const,
                                    color: 'rgba(244, 226, 180, 0.5)',
                                    marginBottom: 6,
                                }}>{t.label}</div>
                                <div className="bo-metric-xl" style={{
                                    fontFamily: "var(--bo-font-display)",
                                    fontSize: 26, fontWeight: 800, lineHeight: 1.1,
                                    fontVariantNumeric: 'tabular-nums',
                                }}>{t.value}</div>
                                <div style={{
                                    marginTop: 4, fontSize: 12,
                                    color: t.accent ? 'var(--bo-accent)' : t.warn ? 'rgba(229, 180, 49, 0.7)' : 'rgba(244, 241, 235, 0.45)',
                                    fontWeight: 600,
                                    fontFamily: "var(--bo-font-mono)",
                                    fontVariantNumeric: 'tabular-nums',
                                }}>{t.sub}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Direction summary + controls — single control row */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    padding: '6px 8px',
                    background: 'var(--bo-paper)',
                    border: '1px solid var(--bo-hairline)',
                    borderRadius: 'var(--bo-radius-md)',
                    boxShadow: 'var(--bo-shadow-tile)',
                }}>
                    {/* Direction tier strip */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {([
                            { id: 'NB_TO_BB' as const, label: 'NB → BB', count: nbToBb.skuCount, dot: 'var(--bo-bronze-strong)' },
                            { id: 'BB_TO_NB' as const, label: 'BB → NB', count: bbToNb.skuCount, dot: 'var(--bo-accent)' },
                        ]).map(d => {
                            const isActive = dirFilter === d.id;
                            return (
                                <button key={d.id}
                                    onClick={() => { setDirFilter(isActive ? 'ALL' : d.id); setCurrentPage(1); }}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        height: 30, padding: '0 10px',
                                        borderRadius: 'var(--bo-radius-sm)',
                                        background: isActive ? `color-mix(in srgb, ${d.dot} 10%, transparent)` : 'transparent',
                                        border: isActive ? `1px solid ${d.dot}` : '1px solid transparent',
                                        cursor: 'pointer',
                                        fontFamily: "var(--bo-font-body)",
                                        fontSize: 13, fontWeight: 700,
                                        color: isActive ? d.dot : 'var(--bo-ink-muted)',
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase' as const,
                                        transition: 'all 140ms ease',
                                        whiteSpace: 'nowrap' as const,
                                    }}>
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.dot, flexShrink: 0 }} />
                                    <span>{d.label}</span>
                                    <span style={{
                                        fontFamily: "var(--bo-font-mono)",
                                        fontVariantNumeric: 'tabular-nums',
                                        fontSize: 13, fontWeight: 800,
                                        color: isActive ? d.dot : 'var(--bo-ink)',
                                    }}>{d.count}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ width: 1, height: 22, background: 'var(--bo-hairline)', flexShrink: 0 }} />

                    {/* Sort segmented */}
                    <div className="bo-segmented" role="group" aria-label="Sắp xếp">
                        {([
                            { id: 'value_desc' as const, label: 'Giá trị' },
                            { id: 'benefit_desc' as const, label: 'Lợi ích' },
                            { id: 'qty_desc' as const, label: 'SL' },
                            { id: 'mos_asc' as const, label: 'MOS' },
                        ]).map(s => (
                            <button key={s.id} type="button"
                                onClick={() => { setSortKey(s.id); setCurrentPage(1); }}
                                aria-pressed={sortKey === s.id} data-active={sortKey === s.id}>
                                {s.label}
                            </button>
                        ))}
                    </div>

                    {selectedCodes.size > 0 && (
                        <>
                            <div style={{ width: 1, height: 22, background: 'var(--bo-hairline)', flexShrink: 0 }} />
                            <button onClick={clearSelection} className="bo-chip bo-chip-tone-danger">
                                <FaIcon className="fas fa-xmark" style={{ fontSize: 12 }} />
                                <span className="bo-mono">{selectedCodes.size}</span> chọn
                            </button>
                        </>
                    )}

                    {/* Search */}
                    <div style={{ marginLeft: 'auto', position: 'relative', width: 220, flexShrink: 0 }}>
                        <FaIcon className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: 'var(--bo-ink-soft)' }} />
                        <input
                            type="text"
                            placeholder="Tìm mã / tên hàng…"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            autoComplete="off"
                            spellCheck={false}
                            className="w-full pl-9 pr-3 h-8 text-[11px] font-semibold tabular-nums outline-none transition-colors"
                            style={{
                                background: 'var(--bo-surface-sunken)',
                                border: '1px solid var(--bo-hairline)',
                                borderRadius: 'var(--bo-radius-sm)',
                                color: 'var(--bo-ink)',
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--bo-bronze)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--bo-hairline)')}
                        />
                    </div>
                </div>
            </div>

            {/* Top 5 strip */}
            {stats.top5ByValue.length > 0 && (
                <div className="px-6 lg:px-8 pb-3" style={{ display: 'flex', gap: 6, overflow: 'auto' }}>
                    <span style={{
                        fontSize: 12, fontWeight: 800, letterSpacing: '0.18em',
                        textTransform: 'uppercase' as const, color: 'var(--bo-ink-muted)',
                        alignSelf: 'center', flexShrink: 0, paddingRight: 4,
                    }}>Top 5</span>
                    {stats.top5ByValue.map(fi => (
                        <button
                            key={fi.item.ItemCode}
                            onClick={() => onItemSelect(fi.item)}
                            className="bo-chip"
                        >
                            <span style={{ fontFamily: 'var(--bo-font-mono)', fontWeight: 800, fontSize: 13 }}>{fi.item.ItemCode}</span>
                            <span style={{
                                fontSize: 11, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                                background: fi.direction === 'NB_TO_BB' ? 'var(--bo-bronze-soft)' : 'var(--bo-accent-soft)',
                                color: fi.direction === 'NB_TO_BB' ? 'var(--bo-bronze-strong)' : 'var(--bo-accent-deep)',
                            }}>
                                {fi.direction === 'NB_TO_BB' ? 'NB→BB' : 'BB→NB'}
                            </span>
                            <span style={{ fontFamily: 'var(--bo-font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--bo-accent-deep)' }}>
                                {formatVND(fi.transferValue)}₫
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Excluded notice */}
            {filterResult.excluded.length > 0 && (
                <div className="px-6 lg:px-8 pb-2">
                    <details style={{ fontSize: 13 }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--bo-ink-muted)', fontWeight: 700 }}>
                            <FaIcon className="fas fa-filter-circle-xmark" style={{ marginRight: 4 }} />
                            {filterResult.excluded.length} SKU bị loại bởi Smart Filter
                        </summary>
                        <div style={{
                            marginTop: 8, maxHeight: 128, overflowY: 'auto',
                            background: 'var(--bo-surface-sunken)',
                            borderRadius: 'var(--bo-radius-sm)',
                            padding: 12,
                            border: '1px solid var(--bo-hairline)',
                        }}>
                            {filterResult.excluded.slice(0, 20).map((ex, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span style={{ fontFamily: 'var(--bo-font-mono)', fontWeight: 800, color: 'var(--bo-ink)' }}>{ex.item.ItemCode}</span>
                                    <span style={{ color: 'var(--bo-ink-muted)' }}>—</span>
                                    <span style={{ color: 'var(--bo-ink-muted)' }}>{ex.reason}</span>
                                </div>
                            ))}
                            {filterResult.excluded.length > 20 && (
                                <div style={{ color: 'var(--bo-ink-muted)', fontWeight: 700 }}>…và {filterResult.excluded.length - 20} SKU khác</div>
                            )}
                        </div>
                    </details>
                </div>
            )}

            {/* ═══ DATA TABLE — bo-data-table-shell ═══ */}
            <div className="flex-1 overflow-hidden flex flex-col px-6 lg:px-8 pb-6">
                <div className="bo-data-table-shell flex-1 flex flex-col" style={{
                    background: 'var(--bo-paper)',
                    border: '1px solid var(--bo-hairline)',
                    borderRadius: 'var(--bo-radius-lg)',
                    boxShadow: 'var(--bo-shadow-tile)',
                    overflow: 'hidden',
                }}>
                    {/* Table header bar */}
                    <div style={{
                        padding: '16px 24px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                        background: 'var(--bo-surface-sunken)',
                        borderBottom: '1px solid var(--bo-hairline)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <h3 style={{
                                fontFamily: 'var(--bo-font-display)',
                                fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em',
                                color: 'var(--bo-ink)', margin: 0,
                            }}>Danh sách điều phối</h3>
                            <span style={{
                                fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.18em',
                                fontWeight: 800, color: 'var(--bo-ink-muted)',
                            }}>
                                <span style={{ fontFamily: 'var(--bo-font-mono)' }}>{allItems.length.toLocaleString('vi-VN')}</span> kết quả
                            </span>
                        </div>
                    </div>

                    {/* Table content */}
                    <div style={{ flex: 1, overflow: 'auto' }}>
                        {isMobile ? (
                            <MobileCardView
                                items={paginatedItems}
                                selectedCodes={selectedCodes}
                                onToggle={toggleSelect}
                                onItemSelect={onItemSelect}
                            />
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--bo-hairline)' }}>
                                        <th style={{ ...thStyle(), width: 40, textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedCodes.size > 0 && selectedCodes.size === allItems.length}
                                                onChange={toggleSelectAll}
                                                style={{ width: 14, height: 14 }}
                                            />
                                        </th>
                                        <th style={{ ...thStyle(), textAlign: 'left' }}>SKU</th>
                                        <th style={thStyle()}>Chuyển</th>
                                        <th style={thStyle()}>Kho Gửi (Trước → Sau)</th>
                                        <th style={thStyle()}>Kho Nhận (Trước → Sau)</th>
                                        <th style={{ ...thStyle(), textAlign: 'right' }}>Giá trị</th>
                                        <th style={thStyle()}>Tác động</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedItems.length > 0 ? paginatedItems.map(fi => (
                                        <TransferRow
                                            key={`${fi.item.ItemCode}-${fi.direction}`}
                                            fi={fi}
                                            isSelected={selectedCodes.has(fi.item.ItemCode)}
                                            onToggle={toggleSelect}
                                            onItemSelect={onItemSelect}
                                        />
                                    )) : (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '80px 0', textAlign: 'center' }}>
                                                <FaIcon className="fas fa-shuffle" style={{ fontSize: 48, color: 'var(--bo-hairline)', display: 'block', margin: '0 auto 16px' }} />
                                                <p style={{ color: 'var(--bo-ink-muted)', fontWeight: 700, fontSize: 14 }}>
                                                    {searchTerm ? 'Không tìm thấy mã phù hợp' : 'Không có đề xuất điều phối'}
                                                </p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination */}
                    <div style={{
                        padding: '12px 24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderTop: '1px solid var(--bo-hairline)',
                        background: 'var(--bo-surface-sunken)',
                        fontSize: 13,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div className="bo-segmented" role="group">
                                {([20, 50, 100] as const).map(n => (
                                    <button key={n} type="button"
                                        onClick={() => { setItemsPerPage(n); setCurrentPage(1); }}
                                        aria-pressed={itemsPerPage === n} data-active={itemsPerPage === n}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                            <span style={{ color: 'var(--bo-ink-muted)', fontWeight: 700 }}>
                                Tổng: <span style={{ fontFamily: 'var(--bo-font-mono)', color: 'var(--bo-ink)' }}>{allItems.length.toLocaleString('vi-VN')}</span> SKU
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <PaginationBtn onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                <FaIcon className="fas fa-chevron-left" style={{ fontSize: 12 }} />
                            </PaginationBtn>
                            {paginationRange(currentPage, totalPages).map((p, i) =>
                                p === '...' ? (
                                    <span key={`dot-${i}`} style={{ padding: '0 4px', color: 'var(--bo-ink-muted)' }}>…</span>
                                ) : (
                                    <PaginationBtn key={p} onClick={() => setCurrentPage(p as number)} active={currentPage === p}>
                                        {p}
                                    </PaginationBtn>
                                )
                            )}
                            <PaginationBtn onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                <FaIcon className="fas fa-chevron-right" style={{ fontSize: 12 }} />
                            </PaginationBtn>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Style helpers ─── */

const thStyle = (): React.CSSProperties => ({
    padding: '10px 12px',
    fontSize: 12, fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'var(--bo-ink-muted)',
    textAlign: 'center',
    fontFamily: 'var(--bo-font-body)',
    background: 'var(--bo-surface-sunken)',
});

function PaginationBtn({ onClick, disabled, active, children }: {
    onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode;
}) {
    return (
        <button onClick={onClick} disabled={disabled} style={{
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--bo-radius-sm)',
            border: 'none', cursor: disabled ? 'default' : 'pointer',
            fontFamily: 'var(--bo-font-mono)',
            fontSize: 13, fontWeight: 800,
            background: active ? 'var(--bo-ink)' : 'transparent',
            color: active ? '#F4F1EB' : disabled ? 'var(--bo-hairline)' : 'var(--bo-ink-muted)',
            transition: 'all 140ms ease',
        }}>
            {children}
        </button>
    );
}

/* ─── Sub-Components ─── */

function MOSBar({ value }: { value: number }) {
    const pct = Math.min(value / 6, 1) * 100;
    const color = value < 1 ? 'var(--bo-critical)' : value < 2 ? 'var(--bo-accent)' : value < 4 ? 'var(--bo-ok)' : 'var(--bo-bronze)';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <div style={{ flex: 1, height: 4, background: 'var(--bo-hairline)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: color, width: `${pct}%`, transition: 'width 400ms ease' }} />
            </div>
            <span style={{
                fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800, width: 28, textAlign: 'right',
                color: value < 1.5 ? 'var(--bo-critical)' : 'var(--bo-ink)',
            }}>{value.toFixed(1)}</span>
        </div>
    );
}

function MOSTransition({ before, after, label }: { before: number; after: number | null; label: string }) {
    const afterVal = after ?? before;
    const delta = afterVal - before;
    const improved = delta > 0.05;
    const worsened = delta < -0.05;
    return (
        <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--bo-ink-muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                    fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800,
                    color: before < 1.5 ? 'var(--bo-critical)' : 'var(--bo-ink)',
                }}>{before.toFixed(1)}</span>
                <FaIcon className="fas fa-arrow-right" style={{
                    fontSize: 10,
                    color: improved ? 'var(--bo-ok)' : worsened ? 'var(--bo-critical)' : 'var(--bo-ink-muted)',
                }} />
                <span style={{
                    fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800,
                    color: afterVal < 1 ? 'var(--bo-critical)' : afterVal < 2 ? 'var(--bo-accent)' : 'var(--bo-ok)',
                }}>{afterVal.toFixed(1)}</span>
            </div>
            <MOSBar value={afterVal} />
        </div>
    );
}

function TransferRow({ fi, isSelected, onToggle, onItemSelect }: {
    fi: FilteredTransferItem;
    isSelected: boolean;
    onToggle: (code: string) => void;
    onItemSelect: (item: InventoryItem) => void;
}) {
    const item = fi.item;
    const tr = item.computed?.transfer;
    const t = fi.transfer;
    const isNBtoBB = fi.direction === 'NB_TO_BB';

    const donorLabel = isNBtoBB ? 'NB' : 'BB';
    const receiverLabel = isNBtoBB ? 'BB' : 'NB';
    const donorMOSBefore = tr ? (isNBtoBB ? tr.mosNB : tr.mosBB) : 0;
    const receiverMOSBefore = tr ? (isNBtoBB ? tr.mosBB : tr.mosNB) : 0;
    const donorStock = tr ? (isNBtoBB ? tr.physicalNB : tr.physicalBB) : 0;
    const receiverStock = tr ? (isNBtoBB ? tr.physicalBB : tr.physicalNB) : 0;
    const donorBO = isNBtoBB ? (item.Backorder_NB || 0) : (item.Backorder_BB || 0);
    const receiverBO = isNBtoBB ? (item.Backorder_BB || 0) : (item.Backorder_NB || 0);
    const hasCritical = t.reasonCodes.includes('CRITICAL_SHORTAGE_COVERED');

    const rowBg = isSelected ? 'var(--bo-bronze-soft)' : undefined;

    return (
        <tr
            style={{
                borderBottom: '1px solid var(--bo-hairline)',
                cursor: 'pointer', transition: 'background 100ms ease',
                background: rowBg,
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bo-surface-sunken)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = rowBg || ''; }}
            onClick={() => onItemSelect(item)}
        >
            <td style={{ padding: '12px', textAlign: 'center' }}
                onClick={e => { e.stopPropagation(); onToggle(item.ItemCode); }}>
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(item.ItemCode)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 14, height: 14 }}
                />
            </td>
            <td style={{ padding: '12px' }}>
                <div style={{ fontFamily: 'var(--bo-font-mono)', fontWeight: 800, fontSize: 13, color: 'var(--bo-ink)' }}>{item.ItemCode}</div>
                <div style={{ fontSize: 12, color: 'var(--bo-ink-muted)', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.ItemName}</div>
                {item.SNP && item.SNP > 1 && (
                    <span style={{ fontSize: 11, color: 'var(--bo-ink-muted)', fontWeight: 700 }}>SNP: {item.SNP}</span>
                )}
            </td>
            <td style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 12, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                        background: isNBtoBB ? 'var(--bo-bronze-soft)' : 'var(--bo-accent-soft)',
                        color: isNBtoBB ? 'var(--bo-bronze-strong)' : 'var(--bo-accent-deep)',
                    }}>
                        {isNBtoBB ? 'NB→BB' : 'BB→NB'}
                    </span>
                    <span style={{ fontFamily: 'var(--bo-font-mono)', fontSize: 15, fontWeight: 800, color: 'var(--bo-ink)' }}>
                        {fi.roundedQty.toLocaleString()}
                    </span>
                </div>
            </td>
            <td style={{ padding: '12px' }}>
                <div style={{ width: 140 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--bo-ink-muted)' }}>OH: {donorStock.toLocaleString()}</span>
                        <span style={{ fontWeight: 700, color: 'var(--bo-critical)' }}>−{fi.roundedQty}</span>
                    </div>
                    <MOSTransition before={donorMOSBefore} after={t.donorMOSAfterGive} label={`${donorLabel} MOS`} />
                    {donorBO > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bo-critical)', marginTop: 4 }}>
                            <FaIcon className="fas fa-exclamation-triangle" style={{ fontSize: 10, marginRight: 4 }} />BO: {donorBO}
                        </div>
                    )}
                </div>
            </td>
            <td style={{ padding: '12px' }}>
                <div style={{ width: 140 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--bo-ink-muted)' }}>OH: {receiverStock.toLocaleString()}</span>
                        <span style={{ fontWeight: 700, color: 'var(--bo-ok)' }}>+{fi.roundedQty}</span>
                    </div>
                    <MOSTransition before={receiverMOSBefore} after={t.receiverMOSAfterReceive} label={`${receiverLabel} MOS`} />
                    {receiverBO > 0 && (
                        <div style={{
                            fontSize: 12, fontWeight: 700, marginTop: 4,
                            color: hasCritical ? 'var(--bo-ok)' : 'var(--bo-critical)',
                        }}>
                            {hasCritical
                                ? <><FaIcon className="fas fa-check-circle" style={{ fontSize: 10, marginRight: 4 }} />BO {receiverBO} covered</>
                                : <><FaIcon className="fas fa-exclamation-triangle" style={{ fontSize: 10, marginRight: 4 }} />BO: {receiverBO}</>
                            }
                        </div>
                    )}
                </div>
            </td>
            <td style={{ padding: '12px', textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--bo-font-mono)', fontWeight: 800, color: 'var(--bo-accent-deep)' }}>{formatVND(fi.transferValue)}₫</div>
                <div style={{ fontFamily: 'var(--bo-font-mono)', fontSize: 12, color: 'var(--bo-ink-muted)', fontWeight: 600, marginTop: 2 }}>
                    @{Math.round(item.computed?.unitCost || 0).toLocaleString()}₫
                </div>
            </td>
            <td style={{ padding: '12px' }}>
                <div style={{ minWidth: 120 }}>
                    <div style={{
                        fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800,
                        color: t.transferNetBenefit > 0 ? 'var(--bo-ok)' : 'var(--bo-critical)',
                        marginBottom: 4,
                    }}>
                        Net: {formatVND(t.transferNetBenefit)}₫
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {hasCritical && (
                            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--bo-ok-soft)', color: 'var(--bo-ok)' }}>BO COVER</span>
                        )}
                        {t.reasonCodes.includes('BUFFER_IMPROVED') && (
                            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--bo-bronze-soft)', color: 'var(--bo-bronze-strong)' }}>BUFFER ↑</span>
                        )}
                        {t.reasonCodes.includes('DONOR_RISK_AFTER') && (
                            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--bo-critical-soft)', color: 'var(--bo-critical)' }}>DONOR RISK</span>
                        )}
                    </div>
                    <div style={{
                        fontSize: 11, color: 'var(--bo-ink-muted)', fontWeight: 500, marginTop: 4,
                        maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={t.reasonText}>
                        {t.reasonText}
                    </div>
                </div>
            </td>
        </tr>
    );
}

function MobileCardView({ items, selectedCodes, onToggle, onItemSelect }: {
    items: FilteredTransferItem[];
    selectedCodes: Set<string>;
    onToggle: (code: string) => void;
    onItemSelect: (item: InventoryItem) => void;
}) {
    if (items.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
                <FaIcon className="fas fa-shuffle" style={{ fontSize: 48, color: 'var(--bo-hairline)', display: 'block', margin: '0 auto 16px' }} />
                <p style={{ color: 'var(--bo-ink-muted)', fontWeight: 700 }}>Không có đề xuất</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, padding: 16 }}>
            {items.map(fi => {
                const item = fi.item;
                const tr = item.computed?.transfer;
                const t = fi.transfer;
                const isSelected = selectedCodes.has(item.ItemCode);
                const isNBtoBB = fi.direction === 'NB_TO_BB';
                const donorMOSBefore = tr ? (isNBtoBB ? tr.mosNB : tr.mosBB) : 0;
                const receiverMOSBefore = tr ? (isNBtoBB ? tr.mosBB : tr.mosNB) : 0;
                const donorStock = tr ? (isNBtoBB ? tr.physicalNB : tr.physicalBB) : 0;
                const receiverStock = tr ? (isNBtoBB ? tr.physicalBB : tr.physicalNB) : 0;
                const receiverBO = isNBtoBB ? (item.Backorder_BB || 0) : (item.Backorder_NB || 0);
                const hasCritical = t.reasonCodes.includes('CRITICAL_SHORTAGE_COVERED');

                return (
                    <div
                        key={`${item.ItemCode}-${fi.direction}`}
                        onClick={() => onItemSelect(item)}
                        style={{
                            borderRadius: 'var(--bo-radius-md)',
                            border: `1px solid ${isSelected ? 'var(--bo-bronze)' : 'var(--bo-hairline)'}`,
                            background: isSelected ? 'var(--bo-bronze-soft)' : 'var(--bo-paper)',
                            overflow: 'hidden', cursor: 'pointer',
                            boxShadow: 'var(--bo-shadow-tile)',
                        }}
                    >
                        {/* Card header */}
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                            padding: 12, borderBottom: '1px solid var(--bo-hairline)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <div
                                    onClick={e => { e.stopPropagation(); onToggle(item.ItemCode); }}
                                    style={{
                                        width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                                        border: `1px solid ${isSelected ? 'var(--bo-bronze)' : 'var(--bo-hairline)'}`,
                                        background: isSelected ? 'var(--bo-bronze)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff',
                                    }}
                                >
                                    {isSelected && <FaIcon className="fas fa-check" style={{ fontSize: 12 }} />}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--bo-font-mono)', fontWeight: 800, color: 'var(--bo-ink)', fontSize: 14 }}>{item.ItemCode}</div>
                                    <div style={{ fontSize: 12, color: 'var(--bo-ink-muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.ItemName}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                <span style={{
                                    fontSize: 12, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                                    background: isNBtoBB ? 'var(--bo-bronze-soft)' : 'var(--bo-accent-soft)',
                                    color: isNBtoBB ? 'var(--bo-bronze-strong)' : 'var(--bo-accent-deep)',
                                }}>
                                    {isNBtoBB ? 'NB→BB' : 'BB→NB'} × {fi.roundedQty.toLocaleString()}
                                </span>
                                <span style={{ fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--bo-accent-deep)' }}>
                                    {formatVND(fi.transferValue)}₫
                                </span>
                            </div>
                        </div>

                        {/* Before → After panels */}
                        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ background: 'var(--bo-surface-sunken)', borderRadius: 'var(--bo-radius-sm)', padding: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--bo-ink-muted)', marginBottom: 6 }}>
                                    Kho Gửi ({isNBtoBB ? 'NB' : 'BB'})
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 700, color: 'var(--bo-ink-muted)' }}>OH: {donorStock.toLocaleString()}</span>
                                    <span style={{ fontWeight: 700, color: 'var(--bo-critical)' }}>−{fi.roundedQty}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800, color: donorMOSBefore < 1.5 ? 'var(--bo-critical)' : 'var(--bo-ink)' }}>
                                        {donorMOSBefore.toFixed(1)}
                                    </span>
                                    <FaIcon className="fas fa-arrow-right" style={{ fontSize: 10, color: 'var(--bo-ink-muted)' }} />
                                    <span style={{
                                        fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800,
                                        color: (t.donorMOSAfterGive ?? donorMOSBefore) < 1 ? 'var(--bo-critical)' :
                                            (t.donorMOSAfterGive ?? donorMOSBefore) < 2 ? 'var(--bo-accent)' : 'var(--bo-ok)',
                                    }}>
                                        {(t.donorMOSAfterGive ?? donorMOSBefore).toFixed(1)}M
                                    </span>
                                </div>
                            </div>
                            <div style={{ background: 'var(--bo-ok-soft)', borderRadius: 'var(--bo-radius-sm)', padding: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--bo-ink-muted)', marginBottom: 6 }}>
                                    Kho Nhận ({isNBtoBB ? 'BB' : 'NB'})
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 700, color: 'var(--bo-ink-muted)' }}>OH: {receiverStock.toLocaleString()}</span>
                                    <span style={{ fontWeight: 700, color: 'var(--bo-ok)' }}>+{fi.roundedQty}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800, color: receiverMOSBefore < 1.5 ? 'var(--bo-critical)' : 'var(--bo-ink)' }}>
                                        {receiverMOSBefore.toFixed(1)}
                                    </span>
                                    <FaIcon className="fas fa-arrow-right" style={{ fontSize: 10, color: 'var(--bo-ok)' }} />
                                    <span style={{
                                        fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800,
                                        color: (t.receiverMOSAfterReceive ?? receiverMOSBefore) < 1 ? 'var(--bo-critical)' :
                                            (t.receiverMOSAfterReceive ?? receiverMOSBefore) < 2 ? 'var(--bo-accent)' : 'var(--bo-ok)',
                                    }}>
                                        {(t.receiverMOSAfterReceive ?? receiverMOSBefore).toFixed(1)}M
                                    </span>
                                </div>
                                {receiverBO > 0 && (
                                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: hasCritical ? 'var(--bo-ok)' : 'var(--bo-critical)' }}>
                                        {hasCritical ? '✓ BO covered' : `BO: ${receiverBO}`}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Impact footer */}
                        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontFamily: 'var(--bo-font-mono)', fontSize: 13, fontWeight: 800, color: t.transferNetBenefit > 0 ? 'var(--bo-ok)' : 'var(--bo-critical)' }}>
                                Net: {formatVND(t.transferNetBenefit)}₫
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {hasCritical && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--bo-ok-soft)', color: 'var(--bo-ok)' }}>BO COVER</span>}
                                {t.reasonCodes.includes('BUFFER_IMPROVED') && <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--bo-bronze-soft)', color: 'var(--bo-bronze-strong)' }}>BUFFER↑</span>}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function paginationRange(current: number, total: number): (number | '...')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
        pages.push(i);
    }
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
}
