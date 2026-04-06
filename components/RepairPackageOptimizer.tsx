import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InventoryItem, KittingDefinition, OrderingDraft } from '../types/inventory';
import { parseKittingCSV } from '../utils/csvParser';
import { useLanguage } from '../utils/i18n';
import { saveToCloudStorage, loadFromCloudStorage, verifyAdminPin } from '../utils/supabase';

// Inline: RepairPackageMetrics
const RepairPackageMetrics = ({ sets }: { sets: any[] }) => {
    const { t } = useLanguage();
    const totalSets = sets.length;
    const readyNB = sets.filter(s => s.maxSetsNB > 0).length;
    const readyBB = sets.filter(s => s.maxSetsBB > 0).length;
    const totalValue = sets.reduce((sum, s) => sum + s.packageStockValue, 0);
    const avgCompletion = sets.length > 0
        ? sets.reduce((sum, s) => sum + (s.completionRateNB + s.completionRateBB) / 2, 0) / sets.length
        : 0;

    const metrics = [
        { label: t('kit_metric_total'), value: totalSets, icon: 'fa-boxes-packing', color: 'text-blue-700', bg: 'bg-blue-50' },
        { label: t('kit_metric_ready_nb'), value: `${readyNB}/${totalSets}`, icon: 'fa-check-circle', color: 'text-emerald-700', bg: 'bg-emerald-50' },
        { label: t('kit_metric_ready_bb'), value: `${readyBB}/${totalSets}`, icon: 'fa-check-circle', color: 'text-amber-700', bg: 'bg-amber-50' },
        { label: t('kit_metric_capital'), value: `${(totalValue / 1000000).toFixed(1)}tr`, icon: 'fa-coins', color: 'text-purple-700', bg: 'bg-purple-50' },
        { label: t('kit_metric_completion'), value: `${Math.round(avgCompletion * 100)}%`, icon: 'fa-chart-pie', color: 'text-indigo-700', bg: 'bg-indigo-50' },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {metrics.map(m => (
                <div key={m.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.bg} shrink-0`}>
                        <i className={`fas ${m.icon} ${m.color}`} />
                    </div>
                    <div>
                        <div className={`text-lg font-black ${m.color}`}>{m.value}</div>
                        <div className="text-2xs font-bold text-slate-400 uppercase leading-tight">{m.label}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

interface RepairPackageOptimizerProps {
    data: InventoryItem[];
    onItemSelect: (item: InventoryItem) => void;
    initialState?: any;
    onSaveState?: (state: any) => void;
    draftData?: OrderingDraft;
    onUpdateDraft?: (draft: OrderingDraft) => void;
    kittingDefs: KittingDefinition[];
    onKittingDefsChange: (defs: KittingDefinition[]) => void;
}

type ViewMode = 'OPTIMIZER' | 'SIMILARITY';

// --- NEW COMPONENT: COMPARISON MATRIX FOR 2-3 PACKAGES ---
const ComparisonMatrix = ({ selectedSets, onItemSelect }: { selectedSets: any[], onItemSelect: (i: InventoryItem) => void }) => {
    const allSkus = useMemo(() => {
        const skus = new Set<string>();
        selectedSets.forEach(s => s.components.forEach((c: any) => skus.add(c.def.ItemCode)));
        return Array.from(skus).sort();
    }, [selectedSets]);

    const getComp = (set: any, sku: string) => set.components.find((c: any) => c.def.ItemCode === sku);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-fadeIn">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-4 min-w-[280px] text-xs font-black text-slate-400 uppercase tracking-widest border-r border-slate-200">Linh kiện / Phụ tùng tổng hợp</th>
                            {selectedSets.map((set, idx) => (
                                <th key={set.setCode} className={`p-4 min-w-[220px] border-r border-slate-200 last:border-r-0 ${idx === 0 ? 'bg-blue-50/30' : idx === 1 ? 'bg-amber-50/30' : 'bg-purple-50/30'}`}>
                                    <div className="text-xs font-black text-slate-400 uppercase mb-1">Gói {String.fromCharCode(65 + idx)}</div>
                                    <div className="text-sm font-black text-slate-800 uppercase truncate" title={set.setName}>{set.setName}</div>
                                    <div className="text-xs font-mono text-slate-500">{set.setCode}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {allSkus.map(sku => {
                            const presenceCount = selectedSets.filter(s => !!getComp(s, sku)).length;
                            const isCommon = presenceCount === selectedSets.length;
                            const firstMatch = selectedSets.find(s => !!getComp(s, sku));
                            const compData = getComp(firstMatch, sku);

                            return (
                                <tr key={sku} className={`hover:bg-slate-50/80 transition-colors ${isCommon ? 'bg-emerald-50/20' : ''}`}>
                                    <td className="p-4 border-r border-slate-100">
                                        <div className="flex items-center gap-2">
                                            {isCommon && <div className="w-2 h-2 rounded-full bg-emerald-500" title="Linh kiện chung"></div>}
                                            <span className="font-mono text-sm font-black text-slate-700 cursor-pointer hover:text-blue-600" onClick={() => compData.item && onItemSelect(compData.item)}>{sku}</span>
                                        </div>
                                        <div className="text-xs text-slate-500 truncate mt-0.5" title={compData?.itemName}>{compData?.itemName}</div>
                                    </td>
                                    {selectedSets.map((set) => {
                                        const c = getComp(set, sku);
                                        return (
                                            <td key={set.setCode} className="p-4 border-r border-slate-100 last:border-r-0">
                                                {c ? (
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex flex-col">
                                                            <span className="text-2xs font-bold text-slate-400 uppercase">Yêu cầu</span>
                                                            <span className="text-sm font-black text-slate-800">x{c.def.QtyRequired}</span>
                                                        </div>
                                                        <div className="flex flex-col text-right">
                                                            <span className="text-2xs font-bold text-slate-400 uppercase">Tồn kho</span>
                                                            <span className={`text-sm font-black ${c.currentStock < c.def.QtyRequired ? 'text-rose-600' : 'text-emerald-600'}`}>{c.currentStock}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="text-center text-slate-200">—</div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="bg-slate-50 font-black border-t-2 border-slate-200">
                        <tr>
                            <td className="p-4 text-xs text-slate-500 uppercase border-r border-slate-200">Hiệu quả tài chính</td>
                            {selectedSets.map((set) => (
                                <td key={set.setCode} className="p-4 border-r border-slate-200 last:border-r-0">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400 uppercase">Vốn tồn:</span>
                                            <span className="text-blue-700">{(set.packageStockValue / 1000000).toFixed(1)}tr</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400 uppercase">Sẵn có:</span>
                                            <span className="text-emerald-600 font-black">{set.maxSetsNB + set.maxSetsBB} bộ</span>
                                        </div>
                                    </div>
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

// --- HELPER: SIMILARITY CALCULATOR (JACCARD INDEX) ---
const calculateSimilarity = (sets: any[]) => {
    const pairs: any[] = [];
    const eligibleSets = sets.filter(s => s.components.length > 1);
    for (let i = 0; i < eligibleSets.length; i++) {
        for (let j = i + 1; j < eligibleSets.length; j++) {
            const setA = eligibleSets[i];
            const setB = eligibleSets[j];
            const itemsA = new Set(setA.components.map((c: any) => c.def.ItemCode));
            const itemsB = new Set(setB.components.map((c: any) => c.def.ItemCode));
            const intersection = new Set([...itemsA].filter(x => itemsB.has(x)));
            const union = new Set([...itemsA, ...itemsB]);
            const jaccard = intersection.size / union.size;
            if (jaccard > 0.2) {
                pairs.push({ setA, setB, jaccardIndex: jaccard, sharedCount: intersection.size });
            }
        }
    }
    return pairs.sort((a, b) => b.jaccardIndex - a.jaccardIndex);
};

const SupplyChainStatusBar = ({ rate }: { rate: number }) => {
    let color = 'bg-blue-600';
    if (rate < 0.5) color = 'bg-rose-500';
    else if (rate < 1) color = 'bg-amber-500';
    else color = 'bg-emerald-500';

    return (
        <div className="w-full mt-2">
            <div className="flex justify-between text-xs font-bold uppercase mb-1 text-slate-500">
                <span>Mức độ sẵn sàng</span>
                <span>{Math.round(rate * 100)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${rate * 100}%` }}></div>
            </div>
        </div>
    );
};

export const RepairPackageOptimizer = ({
    data,
    onItemSelect,
    initialState,
    onSaveState,
    draftData,
    onUpdateDraft,
    kittingDefs,
    onKittingDefsChange
}: RepairPackageOptimizerProps) => {
    const { t } = useLanguage();
    const [viewMode, setViewMode] = useState<ViewMode>(initialState?.viewMode || 'OPTIMIZER');
    const [searchTerm, setSearchTerm] = useState(initialState?.searchTerm || '');
    const [orderInputs, setOrderInputs] = useState<Record<string, { nb: number, bb: number }>>({});
    const [expandedSet, setExpandedSet] = useState<string | null>(null);
    const [selectedComparisonCodes, setSelectedComparisonCodes] = useState<string[]>(initialState?.selectedComparisonCodes || []);
    const [isSavingCloud, setIsSavingCloud] = useState(false);
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSaveToCloud = async () => {
        const pin = prompt('Vui lòng nhập Mã Phê Duyệt (Admin PIN) để lưu cấu hình Gói Phụ Tùng lên máy chủ:\n(Mặc định: 2026)');
        if (pin === null) return;
        if (!verifyAdminPin(pin)) {
            alert('❌ Mã phê duyệt không chính xác!');
            return;
        }
        setIsSavingCloud(true);
        const success = await saveToCloudStorage('kitting_draft', kittingDefs);
        setIsSavingCloud(false);
        if (success) {
            alert('✅ Đã lưu cấu hình Gói Phụ Tùng lên Cloud (Supabase) thành công!');
        } else {
            alert('Lỗi khi lưu lên Cloud. Vui lòng kiểm tra thiết lập SQL Supabase.');
        }
    };

    const handleLoadFromCloud = async () => {
        setIsLoadingCloud(true);
        const cloudData = await loadFromCloudStorage('kitting_draft');
        setIsLoadingCloud(false);
        if (cloudData && Array.isArray(cloudData)) {
            onKittingDefsChange(cloudData);
            alert(`✅ Đã tải ${cloudData.length} định nghĩa Gói Phụ Tùng từ Cloud thành công!`);
        } else {
            alert('Không tìm thấy dữ liệu Kitting nào trên Cloud hoặc có lỗi.');
        }
    };

    useEffect(() => {
        if (onSaveState) {
            onSaveState({ viewMode, searchTerm, selectedComparisonCodes, kittingDefs });
        }
    }, [viewMode, searchTerm, selectedComparisonCodes, kittingDefs, onSaveState]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const defs = parseKittingCSV(text);
            if (defs.length > 0) onKittingDefsChange(defs);
            else alert("File CSV không hợp lệ.");
        };
        reader.readAsText(file);
    };

    const { calculatedSets, itemMap } = useMemo(() => {
        const iMap = new Map<string, InventoryItem>();
        data.forEach(item => iMap.set(item.ItemCode, item));

        const groupedSets = new Map<string, KittingDefinition[]>();
        kittingDefs.forEach(def => {
            if (!groupedSets.has(def.SetPartsCode)) groupedSets.set(def.SetPartsCode, []);
            groupedSets.get(def.SetPartsCode)?.push(def);
        });

        let sets: any[] = [];
        groupedSets.forEach((components, setCode) => {
            let maxSetsNB = Infinity, maxSetsBB = Infinity;
            let packageStockValue = 0;

            const compResults = components.map(c => {
                const item = iMap.get(c.ItemCode);
                const sNB = (item?.QuantityInventory_NB || 0) + (item?.QuantityDC_NB || 0);
                const sBB = (item?.QuantityInventory_BB || 0) + (item?.QuantityDC_BB || 0);

                maxSetsNB = Math.min(maxSetsNB, Math.floor(sNB / c.QtyRequired));
                maxSetsBB = Math.min(maxSetsBB, Math.floor(sBB / c.QtyRequired));

                const uPrice = item?.UnitCost_PP || c.UnitPrice || 0;
                packageStockValue += (sNB + sBB) * uPrice;

                return {
                    def: c, item, stockNB: sNB, stockBB: sBB, currentStock: sNB + sBB,
                    itemName: item?.ItemName || c.ItemNameEng || '',
                    unitPrice: uPrice
                };
            });

            sets.push({
                setCode,
                setName: components[0].SetPartsName,
                modelCar: components[0].ModelCar || '',
                maxSetsNB, maxSetsBB,
                completionRateNB: compResults.reduce((acc, c) => acc + Math.min(c.stockNB / c.def.QtyRequired, 1), 0) / compResults.length,
                completionRateBB: compResults.reduce((acc, c) => acc + Math.min(c.stockBB / c.def.QtyRequired, 1), 0) / compResults.length,
                components: compResults,
                packageStockValue: packageStockValue
            });
        });

        sets.sort((a, b) => b.packageStockValue - a.packageStockValue);
        return { calculatedSets: sets, itemMap: iMap };
    }, [data, kittingDefs]);

    const filteredSets = useMemo(() => {
        if (!searchTerm) return calculatedSets;
        const s = searchTerm.toLowerCase();
        return calculatedSets.filter(set =>
            set.setCode.toLowerCase().includes(s) ||
            set.setName.toLowerCase().includes(s) ||
            (set.modelCar && set.modelCar.toLowerCase().includes(s))
        );
    }, [calculatedSets, searchTerm]);

    const similarityPairs = useMemo(() => calculateSimilarity(calculatedSets), [calculatedSets]);
    const manualComparisonSets = useMemo(() => calculatedSets.filter(s => selectedComparisonCodes.includes(s.setCode)), [calculatedSets, selectedComparisonCodes]);

    const toggleSelection = (code: string) => {
        setSelectedComparisonCodes(prev => {
            if (prev.includes(code)) return prev.filter(c => c !== code);
            if (prev.length >= 3) { alert("Tối đa so sánh 3 gói."); return prev; }
            return [...prev, code];
        });
    };

    const handleAddToDraft = (set: any, region: 'NB' | 'BB') => {
        if (!onUpdateDraft) return;
        const qtyToBuild = orderInputs[set.setCode]?.[region === 'NB' ? 'nb' : 'bb'] || 0;
        if (qtyToBuild <= 0) return;

        const currentQuantities = { ...draftData?.quantities };
        const currentNotes = { ...draftData?.notes };

        let addedCount = 0;
        let transferCount = 0;

        set.components.forEach((comp: any) => {
            const qtyNeeded = comp.def.QtyRequired * qtyToBuild;

            // Logic: Net Demand (Required - Current Stock in Region)
            const currentStockRegion = region === 'NB' ? comp.stockNB : comp.stockBB;
            const shortage = Math.max(0, qtyNeeded - currentStockRegion);

            if (shortage > 0) {
                // LOGIC: Check surplus in other region for TRANSFER
                const otherRegion = region === 'NB' ? 'BB' : 'NB';
                const stockOtherRegion = region === 'NB' ? comp.stockBB : comp.stockNB;

                // Can we transfer?
                const transferQty = Math.min(shortage, stockOtherRegion);
                const purchaseQty = shortage - transferQty;

                let noteParts = [];
                noteParts.push(`[Kit:${set.setCode}-${region}:${qtyToBuild}set]`);

                if (transferQty > 0) {
                    noteParts.push(`[CHUYỂN ${otherRegion}->${region}: ${transferQty}]`);
                    transferCount++;
                }

                if (purchaseQty > 0) {
                    const existing = currentQuantities[comp.def.ItemCode] || { air: 0, sea: 0 };
                    // Default to SEA for replenishment
                    currentQuantities[comp.def.ItemCode] = { ...existing, sea: existing.sea + purchaseQty };
                    addedCount++;
                }

                // Always update note if we touched this item (transfer OR purchase)
                if (transferQty > 0 || purchaseQty > 0) {
                    const fullNote = noteParts.join(' ');
                    currentNotes[comp.def.ItemCode] = currentNotes[comp.def.ItemCode] ? `${currentNotes[comp.def.ItemCode]}, ${fullNote}` : fullNote;
                }
            }
        });

        const messages = [];
        if (addedCount > 0) messages.push(`đặt mua thêm ${addedCount} mã`);
        if (transferCount > 0) messages.push(`điều chuyển ${transferCount} mã từ miền khác`);

        if (messages.length > 0) {
            onUpdateDraft({ quantities: currentQuantities, notes: currentNotes });
            alert(`Đã cập nhật dự thảo: ${messages.join(' và ')} cho ${qtyToBuild} bộ ${set.setName} (Khu vực ${region}).`);
        } else {
            alert(`Tồn kho ${region} đã đủ cho ${qtyToBuild} bộ! Không cần đặt thêm hay điều chuyển.`);
        }

        setOrderInputs(prev => ({ ...prev, [set.setCode]: { ...prev[set.setCode], [region === 'NB' ? 'nb' : 'bb']: 0 } }));
    };

    const handleClearDraft = () => {
        // Fix check to include notes (transfers)
        const hasContent = (Object.keys(draftData?.quantities || {}).length > 0) || (Object.keys(draftData?.notes || {}).length > 0);

        if (!hasContent && Object.keys(orderInputs).length === 0) return; // Also allow clearing inputs if draft is empty

        if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ dự thảo đặt hàng và reset các ô nhập liệu?")) {
            if (onUpdateDraft) onUpdateDraft({ quantities: {}, notes: {} });
            setOrderInputs({});
        }
    };

    // Fix counting logic: Include Items with Notes (transfers) even if Qty is 0
    const totalDraftItems = useMemo(() => {
        const qtyKeys = Object.keys(draftData?.quantities || {});
        const noteKeys = Object.keys(draftData?.notes || {});
        const uniqueKeys = new Set([...qtyKeys, ...noteKeys]);
        return uniqueKeys.size;
    }, [draftData]);

    const hasInputs = Object.keys(orderInputs).length > 0;

    if (!kittingDefs || kittingDefs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center animate-fadeIn">
                <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6"><i className="fas fa-boxes-packing text-3xl"></i></div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Chưa có dữ liệu Gói phụ tùng</h3>
                <p className="text-slate-500 max-w-md mb-8 text-base">Vui lòng tải lên file định nghĩa (CSV) để hệ thống tính toán khả năng sẵn sàng của các bộ linh kiện sửa chữa.</p>
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-blue-200 transition-all flex items-center gap-3"><i className="fas fa-upload"></i> {t('kit_upload_btn')}</button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-6 relative pb-24">
            {/* Page Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden border border-white/5 shadow-premium">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>
                <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase flex items-center gap-3">
                            <i className="fas fa-boxes-packing text-amber-200"></i> {t('kit_title')}
                        </h2>
                        <p className="text-amber-200 text-sm font-bold mt-1 uppercase tracking-widest">Tối ưu hóa khả năng sẵn sàng của các bộ linh kiện sửa chữa</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:gap-3">
                        {(totalDraftItems > 0 || hasInputs) && (
                            <div className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-xl border border-slate-200">
                                <span className="text-[10px] font-black text-slate-400 uppercase pl-1">Đang chọn: {totalDraftItems} mã</span>
                                <button
                                    onClick={handleClearDraft}
                                    className="px-3 py-1 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-[10px] font-black hover:bg-rose-100 transition-colors"
                                >
                                    <i className="fas fa-trash-alt mr-1"></i> Xóa Draft
                                </button>
                            </div>
                        )}

                        {/* Cloud Buttons - SOLID WHITE BACKGROUNDS */}
                        <button
                            onClick={handleLoadFromCloud}
                            disabled={isLoadingCloud}
                            className="bg-white text-slate-800 hover:bg-slate-50 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm border border-slate-200 disabled:opacity-60"
                        >
                            <i className={`fas ${isLoadingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'} text-blue-600`} /> Tải Cloud
                        </button>
                        
                        {kittingDefs.length > 0 && (
                            <button
                                onClick={handleSaveToCloud}
                                disabled={isSavingCloud}
                                className="bg-white text-slate-800 hover:bg-slate-50 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm border border-slate-200 disabled:opacity-60"
                            >
                                <i className={`fas ${isSavingCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} text-emerald-600`} /> Lưu Cloud
                            </button>
                        )}

                        <div className="flex bg-slate-900 border border-white/10 p-1 rounded-xl">
                            <button onClick={() => setViewMode('OPTIMIZER')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all uppercase ${viewMode === 'OPTIMIZER' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/40 hover:text-white'}`}>Refill Optimizer</button>
                            <button onClick={() => setViewMode('SIMILARITY')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all uppercase ${viewMode === 'SIMILARITY' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/40 hover:text-white'}`}>Similarity</button>
                        </div>
                        <div className="relative group w-56">
                            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                            <input type="text" placeholder="Tìm Gói / Model xe..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-xs font-black text-slate-900 placeholder-slate-400 focus:ring-4 focus:ring-blue-500/5 transition-all" />
                        </div>
                    </div>
                </div>
            </div>

            {/* --- INJECT METRICS DASHBOARD HERE --- */}
            {viewMode === 'OPTIMIZER' && !searchTerm && (
                <RepairPackageMetrics sets={calculatedSets} />
            )}

            {viewMode === 'OPTIMIZER' ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-fadeIn">
                    {filteredSets.map((set: any) => {
                        const currentInputNB = orderInputs[set.setCode]?.nb || 0;
                        const currentInputBB = orderInputs[set.setCode]?.bb || 0;
                        const totalInput = currentInputNB + currentInputBB;

                        return (
                            <div key={set.setCode} className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-all flex flex-col relative ${selectedComparisonCodes.includes(set.setCode) ? 'border-blue-500 ring-2 ring-blue-50 bg-blue-50/10' : 'border-slate-200'}`}>
                                {/* Manual Selection Checkbox */}
                                <button
                                    onClick={() => toggleSelection(set.setCode)}
                                    className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedComparisonCodes.includes(set.setCode) ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-200 hover:border-slate-400'}`}
                                    title="Chọn để so sánh đối ứng"
                                >
                                    <i className="fas fa-check text-2xs"></i>
                                </button>

                                <div className="flex justify-between items-start mb-4 border-b border-slate-50 pb-4 pr-8">
                                    <div>
                                        <h3 className="font-black text-slate-800 text-base uppercase truncate max-w-[220px]">{set.setName}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="text-xs text-slate-400 font-mono font-bold bg-slate-100 px-1.5 rounded">{set.setCode}</div>
                                            {set.modelCar && <div className="text-2xs font-black text-white bg-slate-400 px-1.5 rounded uppercase">{set.modelCar}</div>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Giá trị tồn kho gộp</div>
                                        <div className="text-2xl font-black text-blue-700">{(set.packageStockValue / 1000000).toFixed(1)} tr</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* MIỀN NAM REFILL */}
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        <div className="flex justify-between items-baseline mb-2">
                                            <span className="text-xs font-black text-blue-700 uppercase">MIỀN NAM (NB)</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-2xs font-bold text-slate-400 uppercase">Khả thi</span>
                                                <span className="text-2xl font-black text-slate-800 leading-none">{set.maxSetsNB} bộ</span>
                                            </div>
                                        </div>
                                        <SupplyChainStatusBar rate={set.completionRateNB} />
                                        <div className="mt-3 flex gap-1 items-center">
                                            <div className="relative w-full">
                                                <input type="number" min="0" placeholder="SL Đặt" className="w-full h-8 pl-2 pr-8 text-center text-sm font-black bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-400 transition-colors" value={orderInputs[set.setCode]?.nb || ''} onChange={e => setOrderInputs(p => ({ ...p, [set.setCode]: { ...p[set.setCode], nb: parseInt(e.target.value) || 0 } }))} />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-slate-400 font-bold uppercase">Bộ</span>
                                            </div>
                                            <button onClick={() => handleAddToDraft(set, 'NB')} className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-sm active:scale-90 transition-all hover:bg-blue-700" title="Thêm gói vào dự thảo (NB)"><i className="fas fa-cart-plus text-xs"></i></button>
                                        </div>
                                    </div>
                                    {/* MIỀN BẮC REFILL */}
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        <div className="flex justify-between items-baseline mb-2">
                                            <span className="text-xs font-black text-amber-700 uppercase">MIỀN BẮC (BB)</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-2xs font-bold text-slate-400 uppercase">Khả thi</span>
                                                <span className="text-2xl font-black text-slate-800 leading-none">{set.maxSetsBB} bộ</span>
                                            </div>
                                        </div>
                                        <SupplyChainStatusBar rate={set.completionRateBB} />
                                        <div className="mt-3 flex gap-1 items-center">
                                            <div className="relative w-full">
                                                <input type="number" min="0" placeholder="SL Đặt" className="w-full h-8 pl-2 pr-8 text-center text-sm font-black bg-white border border-slate-200 rounded-lg outline-none focus:border-amber-400 transition-colors" value={orderInputs[set.setCode]?.bb || ''} onChange={e => setOrderInputs(p => ({ ...p, [set.setCode]: { ...p[set.setCode], bb: parseInt(e.target.value) || 0 } }))} />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-slate-400 font-bold uppercase">Bộ</span>
                                            </div>
                                            <button onClick={() => handleAddToDraft(set, 'BB')} className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-sm active:scale-90 transition-all hover:bg-blue-700" title="Thêm gói vào dự thảo (BB)"><i className="fas fa-cart-plus text-xs"></i></button>
                                        </div>
                                    </div>
                                </div>

                                <button onClick={() => setExpandedSet(expandedSet === set.setCode ? null : set.setCode)} className="mt-4 text-xs font-black text-slate-400 hover:text-blue-600 text-center uppercase tracking-[0.2em] transition-colors">
                                    {expandedSet === set.setCode ? 'Thu gọn danh sách' : 'Xem cấu thành chi tiết'}
                                </button>

                                {expandedSet === set.setCode && (
                                    <div className="mt-4 border-t border-slate-100 pt-4 overflow-x-auto animate-fadeIn">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-slate-50 text-slate-400 font-black uppercase">
                                                <tr>
                                                    <th className="px-2 py-1.5">Mã SKU</th>
                                                    <th className="px-2 py-1.5">Tên linh kiện</th>
                                                    <th className="px-2 py-1.5 text-center">Định mức</th>
                                                    <th className="px-2 py-1.5 text-center bg-blue-50 text-blue-700">SL Cần (Input)</th>
                                                    <th className="px-2 py-1.5 text-right">Tồn NB</th>
                                                    <th className="px-2 py-1.5 text-right">Tồn BB</th>
                                                    <th className="px-2 py-1.5 text-center bg-slate-100 text-slate-700">Giải Pháp</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {set.components.map((c: any) => {
                                                    // Calculate breakdown based on input of BOTH regions to show full picture
                                                    const qtyNeededNB = currentInputNB * c.def.QtyRequired;
                                                    const qtyNeededBB = currentInputBB * c.def.QtyRequired;
                                                    const totalNeeded = qtyNeededNB + qtyNeededBB;

                                                    // NB Logic
                                                    const shortageNB = Math.max(0, qtyNeededNB - c.stockNB);
                                                    const transferToNB = Math.min(shortageNB, c.stockBB); // Can take from BB
                                                    const buyNB = shortageNB - transferToNB;

                                                    // BB Logic (Remaining BB stock after transfer to NB)
                                                    const availBBAfterTransfer = Math.max(0, c.stockBB - transferToNB);
                                                    const shortageBB = Math.max(0, qtyNeededBB - availBBAfterTransfer);
                                                    const transferToBB = Math.min(shortageBB, Math.max(0, c.stockNB - qtyNeededNB)); // Can take from remaining NB?
                                                    const buyBB = shortageBB - transferToBB;

                                                    const totalBuy = buyNB + buyBB;
                                                    const totalTransfer = transferToNB + transferToBB;
                                                    const totalStockUse = totalNeeded - totalBuy - totalTransfer;

                                                    return (
                                                        <tr key={c.def.ItemCode} className="hover:bg-slate-50 cursor-pointer" onClick={() => onItemSelect(itemMap.get(c.def.ItemCode)!)}>
                                                            <td className="px-2 py-1.5 font-bold text-slate-700 font-mono">{c.def.ItemCode}</td>
                                                            <td className="px-2 py-1.5 text-slate-500 truncate max-w-[180px]">{c.itemName}</td>
                                                            <td className="px-2 py-1.5 text-center font-bold">x{c.def.QtyRequired}</td>
                                                            <td className="px-2 py-1.5 text-center bg-blue-50/30 font-black text-blue-700">{totalNeeded > 0 ? totalNeeded : '-'}</td>
                                                            <td className="px-2 py-1.5 text-right font-bold text-slate-600">{c.stockNB}</td>
                                                            <td className="px-2 py-1.5 text-right font-bold text-slate-600">{c.stockBB}</td>
                                                            <td className="px-2 py-1.5 text-center bg-slate-50/50 border-x border-slate-100">
                                                                {totalNeeded > 0 ? (
                                                                    <div className="flex justify-center gap-2 text-2xs font-bold">
                                                                        {totalStockUse > 0 && <span className="text-emerald-600 bg-emerald-50 px-1.5 rounded border border-emerald-100" title="Dùng tồn kho">✅ {totalStockUse}</span>}
                                                                        {totalTransfer > 0 && <span className="text-purple-600 bg-purple-50 px-1.5 rounded border border-purple-100" title={`Điều chuyển: ${transferToNB > 0 ? 'BB->NB' : 'NB->BB'}`}>🔄 {totalTransfer}</span>}
                                                                        {totalBuy > 0 && <span className="text-rose-600 bg-rose-50 px-1.5 rounded border border-rose-100" title="Đặt mua mới">🚢 {totalBuy}</span>}
                                                                    </div>
                                                                ) : <span className="text-slate-300">-</span>}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-8 animate-fadeIn">
                    {/* ... (Previous code for Comparison Mode) ... */}
                    {/* MANUAL COMPARISON BLOCK */}
                    {selectedComparisonCodes.length >= 2 ? (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                <h3 className="text-2xl font-black text-slate-900 uppercase flex items-center gap-3">
                                    <i className="fas fa-layer-group text-blue-600"></i> Ma trận đối ứng linh kiện đã chọn
                                </h3>
                                <button onClick={() => setSelectedComparisonCodes([])} className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-black uppercase border border-rose-100 hover:bg-rose-100 transition-all">Hủy so sánh</button>
                            </div>
                            <ComparisonMatrix selectedSets={manualComparisonSets} onItemSelect={onItemSelect} />
                        </div>
                    ) : (
                        <div className="bg-white rounded-[40px] border-2 border-dashed border-slate-200 p-16 text-center shadow-inner">
                            <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-6">
                                <i className="fas fa-check-double text-3xl"></i>
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 uppercase mb-3">So sánh tùy chọn 2-3 gói</h3>
                            <p className="text-base text-slate-500 max-w-md mx-auto mb-8 leading-relaxed font-medium">Bạn có thể chọn tối đa 3 gói từ tab <strong>Refill Optimizer</strong> bằng cách tích chọn vào nút ở góc phải mỗi thẻ gói để xem bảng đối ứng linh kiện chi tiết tại đây.</p>
                            <button onClick={() => setViewMode('OPTIMIZER')} className="px-8 py-3 bg-blue-600 text-white rounded-xl text-sm font-black uppercase shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95">Đi tới chọn gói</button>
                        </div>
                    )}

                    {/* AI SIMILARITY SUGGESTIONS (Always show at bottom) */}
                    <div className="pt-10 border-t border-slate-200">
                        <h3 className="text-2xl font-black text-slate-900 uppercase mb-6 flex items-center gap-3">
                            <i className="fas fa-wand-magic-sparkles text-purple-600"></i> Gợi ý các gói tương đồng (AI Insights)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {similarityPairs.map((pair: any, idx: number) => (
                                <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm hover:border-purple-300 hover:shadow-md transition-all group">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="text-xs font-black text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">{(pair.jaccardIndex * 100).toFixed(0)}% Overlap</div>
                                            <div className="text-xs font-bold text-slate-400">Chung {pair.sharedCount} mã</div>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm font-black text-slate-700">
                                            <span className="truncate max-w-[130px] uppercase">{pair.setA.setName}</span>
                                            <i className="fas fa-arrows-left-right text-slate-300"></i>
                                            <span className="truncate max-w-[130px] uppercase">{pair.setB.setName}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedComparisonCodes([pair.setA.setCode, pair.setB.setCode]); setViewMode('SIMILARITY'); window.scrollTo(0, 0); }}
                                        className="ml-4 w-10 h-10 rounded-xl bg-slate-50 text-slate-400 group-hover:bg-purple-600 group-hover:text-white transition-all flex items-center justify-center border border-slate-100"
                                        title="Xem chi tiết so sánh"
                                    >
                                        <i className="fas fa-eye"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* FLOATING DOCK FOR SELECTION */}
            {selectedComparisonCodes.length > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] animate-fadeIn">
                    <div className="bg-slate-900/95 backdrop-blur-md text-white px-6 py-3.5 rounded-3xl shadow-2xl flex items-center gap-6 border border-white/10">
                        <div className="flex flex-col border-r border-white/10 pr-6 shrink-0">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">So sánh đã chọn</span>
                            <div className="text-base font-black text-blue-400">{selectedComparisonCodes.length} / 3 Gói</div>
                        </div>

                        <div className="flex gap-2 overflow-x-auto max-w-[300px] no-scrollbar">
                            {selectedComparisonCodes.map((code) => (
                                <div key={code} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/5 group">
                                    <span className="text-xs font-mono font-bold">{code}</span>
                                    <button onClick={() => toggleSelection(code)} className="text-white/30 hover:text-rose-400 transition-colors"><i className="fas fa-times text-2xs"></i></button>
                                </div>
                            ))}
                        </div>

                        {selectedComparisonCodes.length >= 2 && (
                            <button
                                onClick={() => setViewMode('SIMILARITY')}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-blue-900/40 transition-all active:scale-95 ml-2 whitespace-nowrap"
                            >
                                <i className="fas fa-chart-simple"></i> Bật bảng đối ứng
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};