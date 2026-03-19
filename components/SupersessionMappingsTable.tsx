
import React, { useState, useMemo } from 'react';
import { SupersessionMapping, SupersessionGraph } from '../utils/supersessionGraph';
import { Typography } from './Typography';
import {
    Search,
    Filter,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    GitMerge,
    Eye,
    ChevronLeft,
    ChevronRight,
    ArrowRight,
    ArrowLeftRight,
    Edit2,
    Trash2
} from 'lucide-react';

interface SupersessionMappingsTableProps {
    mappings: SupersessionMapping[];
    graph: SupersessionGraph;
    onPartClick?: (partNumber: string) => void;
    onEditMapping?: (mapping: SupersessionMapping) => void;
    onDeleteMapping?: (mapping: SupersessionMapping) => void;
}

type SortField = 'oldPart' | 'newPart' | 'type' | 'depth' | 'current';
type SortDirection = 'asc' | 'desc';
type FilterType = 'ALL' | 'ONE_WAY' | 'TWO_WAY';
type FilterDepth = 'ALL' | 'SINGLE' | 'MULTI';

export const SupersessionMappingsTable: React.FC<SupersessionMappingsTableProps> = ({
    mappings,
    graph,
    onPartClick,
    onEditMapping,
    onDeleteMapping
}) => {
    // --- STATE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<FilterType>('ALL');
    const [filterDepth, setFilterDepth] = useState<FilterDepth>('ALL');
    const [sortField, setSortField] = useState<SortField>('oldPart');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);


    // --- DATA PREPARATION ---
    const enrichedData = useMemo(() => {
        if (!mappings) return [];
        return mappings.map(m => {
            // FIX: Use getChain instead of direct map access
            const chain = graph.getChain(m.oldPart);
            return {
                ...m,
                chainDepth: chain ? chain.chainDepth : 1,
                currentPart: chain ? chain.currentPart : m.newPart
            };
        });
    }, [mappings, graph]);

    // --- FILTERING ---
    const filteredData = useMemo(() => {
        return enrichedData.filter(item => {
            // 1. Search
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                if (!item.oldPart.toLowerCase().includes(term) &&
                    !item.newPart.toLowerCase().includes(term)) {
                    return false;
                }
            }

            // 2. Type Filter
            if (filterType === 'ONE_WAY' && item.interchangeable) return false;
            if (filterType === 'TWO_WAY' && !item.interchangeable) return false;

            // 3. Depth Filter
            if (filterDepth === 'SINGLE' && item.chainDepth > 2) return false;
            if (filterDepth === 'MULTI' && item.chainDepth <= 2) return false;

            return true;
        });
    }, [enrichedData, searchTerm, filterType, filterDepth]);

    // --- SORTING ---
    const sortedData = useMemo(() => {
        return [...filteredData].sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (sortField) {
                case 'oldPart': valA = a.oldPart; valB = b.oldPart; break;
                case 'newPart': valA = a.newPart; valB = b.newPart; break;
                case 'type': valA = a.interchangeable ? 1 : 0; valB = b.interchangeable ? 1 : 0; break;
                case 'depth': valA = a.chainDepth; valB = b.chainDepth; break;
                case 'current': valA = a.currentPart; valB = b.currentPart; break;
            }

            if (valA === valB) return 0;

            const compareResult = (typeof valA === 'string' && typeof valB === 'string')
                ? valA.localeCompare(valB)
                : (valA > valB ? 1 : -1);

            return sortDirection === 'asc' ? compareResult : -compareResult;
        });
    }, [filteredData, sortField, sortDirection]);

    // --- PAGINATION ---
    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return sortedData.slice(start, start + itemsPerPage);
    }, [sortedData, currentPage, itemsPerPage]);

    // --- HANDLERS ---
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) return <ArrowUpDown size={12} className="text-slate-300 ml-1 opacity-50 group-hover:opacity-100" />;
        return sortDirection === 'asc'
            ? <ArrowUp size={12} className="text-blue-600 ml-1" />
            : <ArrowDown size={12} className="text-blue-600 ml-1" />;
    };

    const resetFilters = () => {
        setSearchTerm('');
        setFilterType('ALL');
        setFilterDepth('ALL');
        setCurrentPage(1);
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* TOOLBAR */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex items-center gap-2 w-full xl:w-auto">
                    <div className="relative w-full xl:w-72 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                        <input
                            type="text"
                            placeholder="Search Old or New Part..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm text-slate-700"
                        />
                    </div>
                    {(searchTerm || filterType !== 'ALL' || filterDepth !== 'ALL') && (
                        <button onClick={resetFilters} className="text-2xs font-bold text-slate-400 hover:text-rose-500 underline decoration-dashed whitespace-nowrap">
                            Reset Filters
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 transition-colors">
                        <Filter size={12} className="text-slate-400" />
                        <Typography variant="label" className="text-slate-500">Type:</Typography>
                        <select
                            value={filterType}
                            onChange={(e) => { setFilterType(e.target.value as FilterType); setCurrentPage(1); }}
                            className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
                        >
                            <option value="ALL">All Types</option>
                            <option value="ONE_WAY">One-way (→)</option>
                            <option value="TWO_WAY">Two-way (↔)</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-purple-300 transition-colors">
                        <GitMerge size={12} className="text-slate-400" />
                        <Typography variant="label" className="text-slate-500">Chain:</Typography>
                        <select
                            value={filterDepth}
                            onChange={(e) => { setFilterDepth(e.target.value as FilterDepth); setCurrentPage(1); }}
                            className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
                        >
                            <option value="ALL">All Chains</option>
                            <option value="SINGLE">Direct (A→B)</option>
                            <option value="MULTI">Multi-level</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* TABLE */}
            <div className="flex-1 overflow-auto custom-scrollbar relative">
                <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                        <tr>
                            <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort('oldPart')}>
                                <Typography variant="label" className="flex items-center">Old Part {getSortIcon('oldPart')}</Typography>
                            </th>
                            <th className="px-6 py-4 text-center">
                                <Typography variant="label">Logic</Typography>
                            </th>
                            <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort('newPart')}>
                                <Typography variant="label" className="flex items-center">New Part {getSortIcon('newPart')}</Typography>
                            </th>
                            <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort('depth')}>
                                <Typography variant="label" className="flex items-center justify-center">Depth {getSortIcon('depth')}</Typography>
                            </th>
                            <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort('current')}>
                                <Typography variant="label" className="flex items-center">Final Part {getSortIcon('current')}</Typography>
                            </th>
                            <th className="px-6 py-4 text-center sticky right-0 bg-slate-50 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)] border-l border-slate-200">
                                <Typography variant="label">Thao Tác</Typography>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 bg-white">
                        {paginatedData.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-16 text-center">
                                    <div className="flex flex-col items-center justify-center text-slate-400">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                                            {mappings.length === 0 ? <GitMerge size={32} /> : <Search size={32} />}
                                        </div>
                                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-1">
                                            {mappings.length === 0 ? 'No Data Available' : 'No Matches Found'}
                                        </h3>
                                        <p className="text-xs font-medium text-slate-400 max-w-xs">
                                            {mappings.length === 0
                                                ? 'Upload a Supersession CSV file to populate this table.'
                                                : 'Try adjusting filters or search terms.'}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedData.map((row, idx) => (
                                <tr
                                    key={`${row.oldPart}-${row.newPart}-${idx}`}
                                    className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                                    onClick={() => onPartClick && onPartClick(row.oldPart)}
                                >
                                    <td className="px-6 py-3">
                                        <div className="font-mono text-xs font-bold text-slate-600 group-hover:text-blue-700 transition-colors">{row.oldPart}</div>
                                    </td>

                                    <td className="px-6 py-3 text-center">
                                        <div className="flex justify-center">
                                            {row.interchangeable ? (
                                                <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100" title="Two-way Interchangeable">
                                                    <ArrowLeftRight size={12} />
                                                </div>
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200" title="One-way Supersession">
                                                    <ArrowRight size={12} />
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-6 py-3">
                                        <div className="font-mono text-xs font-bold text-slate-800">{row.newPart}</div>
                                    </td>

                                    <td className="px-6 py-3 text-center">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-black ${row.chainDepth > 2 ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                                            {row.chainDepth} Steps
                                        </span>
                                    </td>

                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100/50">
                                                {row.currentPart}
                                            </span>
                                            {row.currentPart === row.newPart && <span className="w-2 h-2 rounded-full bg-emerald-400" title="New Part is Current"></span>}
                                        </div>
                                    </td>

                                    <td className="px-6 py-3 text-center sticky right-0 bg-white group-hover:bg-blue-50/40 border-l border-slate-100 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-md hover:border-blue-100 border border-transparent transition-all"
                                                title="View Chain"
                                                onClick={(e) => { e.stopPropagation(); onPartClick && onPartClick(row.oldPart); }}
                                            >
                                                <Eye size={16} />
                                            </button>
                                            {onEditMapping && (
                                                <button
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-white hover:shadow-md hover:border-amber-100 border border-transparent transition-all"
                                                    title="Chỉnh sửa"
                                                    onClick={(e) => { e.stopPropagation(); onEditMapping(row); }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            )}
                                            {onDeleteMapping && (
                                                <button
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white hover:shadow-md hover:border-rose-100 border border-transparent transition-all"
                                                    title="Xóa"
                                                    onClick={(e) => { e.stopPropagation(); onDeleteMapping(row); }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* PAGINATION FOOTER */}
            {sortedData.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center tracking-widest">
                    <div className="flex items-center gap-4">
                        <Typography variant="label-muted">
                            Showing {Math.min(sortedData.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(sortedData.length, currentPage * itemsPerPage)} of {sortedData.length}
                        </Typography>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} // Reset page on limit change
                            className="bg-white border border-slate-200 rounded px-2 py-0.5 outline-none focus:border-blue-400 cursor-pointer text-[10px] font-bold"
                        >
                            <option value={20}>20 rows</option>
                            <option value={50}>50 rows</option>
                            <option value={100}>100 rows</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm disabled:opacity-50 hover:bg-slate-100 hover:text-blue-600 transition-all"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <button
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm disabled:opacity-50 hover:bg-slate-100 hover:text-blue-600 transition-all"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
