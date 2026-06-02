import React, { useState, useEffect } from 'react';
import { X, RefreshCw, AlertCircle, AlertTriangle, Boxes, CheckCircle2, Truck } from 'lucide-react';
import { fetchRequestById } from '../utils/supabase/approval';
import { expandApprovalToLines } from '../utils/execution/fromApproval';
import { splitBySupplier, type SplittableLine } from '../utils/execution/split';
import { listPartSupplierMap, persistSplit, type OrderMeta } from '../utils/supabase/execution';
import { EXECUTION_MOCK, MOCK_APPROVAL_SNAPSHOT } from '../utils/execution/mockData';
import type { ApprovalRequest } from '../types/inventory';

interface Props {
    approvalId: string;
    onClose: () => void;
    onDone?: () => void;
}

interface SupplierGroup {
    supplier: string;
    lines: SplittableLine[];
    totalQty: number;
}

const ExecutionSplitModal: React.FC<Props> = ({ approvalId, onClose, onDone }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [request, setRequest] = useState<ApprovalRequest | null>(null);
    const [groups, setGroups] = useState<Map<string, SplittableLine[]>>(new Map());
    const [unmapped, setUnmapped] = useState<SplittableLine[]>([]);
    const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [resultMsg, setResultMsg] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const req = EXECUTION_MOCK
                    ? ({ id: approvalId, draft_name: 'DEMO-DRAFT', brand: 'Kia', snapshot_data: MOCK_APPROVAL_SNAPSHOT } as ApprovalRequest)
                    : await fetchRequestById(approvalId);
                if (cancelled) return;
                if (!req) {
                    setError('Không tìm thấy đơn đã duyệt (approval).');
                    return;
                }
                const lines = expandApprovalToLines(req.snapshot_data) as unknown as SplittableLine[];
                const map = await listPartSupplierMap();
                if (cancelled) return;
                const split = splitBySupplier(lines, map);
                setRequest(req);
                setGroups(split.groups);
                setUnmapped(split.unmapped);
                setSupplierOptions([...new Set(map.values())].sort());
            } catch (e) {
                if (!cancelled) setError('Lỗi khi tải & tách đơn theo NCC.');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [approvalId]);

    const supplierGroups: SupplierGroup[] = [...groups.entries()].map(([supplier, lines]) => ({
        supplier,
        lines,
        totalQty: lines.reduce((s, l) => s + (l.qty_ordered || 0), 0),
    }));

    const canConfirm = unmapped.length === 0 && groups.size > 0 && !isSaving;

    const handleAssign = (lineIdx: number, supplier: string) => {
        if (!supplier) return;
        const line = unmapped[lineIdx];
        if (!line) return;
        setUnmapped(prev => prev.filter((_, i) => i !== lineIdx));
        setGroups(prev => {
            const next = new Map(prev);
            const existing = next.get(supplier) ?? [];
            next.set(supplier, [...existing, line]);
            return next;
        });
    };

    const handleConfirm = async () => {
        if (!request || !canConfirm) return;
        setIsSaving(true);
        setError(null);
        try {
            const meta: OrderMeta = {
                po_region_no: request.draft_name ?? null,
                region: request.brand ?? null,
                order_type: null,
                ship_method: null,
            };
            const res = await persistSplit(approvalId, meta, groups);
            setResultMsg(`Đã tạo ${res.orders} đơn NCC với tổng ${res.lines} dòng.`);
            onDone?.();
            onClose();
        } catch (e) {
            setError('Lỗi khi ghi kết quả tách đơn.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-white/20">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <Truck size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-800 tracking-tight">Cổng G1 — Tách &amp; gán NCC</h2>
                            <p className="text-xs font-bold text-slate-400 mt-0.5">
                                {request?.draft_name ?? 'Tách dòng đặt hàng theo nhà cung cấp'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 w-10 h-10 rounded-full transition-all flex items-center justify-center"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 h-[440px] overflow-hidden flex flex-col">
                    {error && (
                        <div className="mb-4 flex gap-3 items-center text-sm font-bold text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-shake">
                            <AlertCircle size={20} className="shrink-0" />
                            {error}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                            <RefreshCw className="animate-spin" size={32} />
                            <span className="text-xs font-black uppercase tracking-widest">Đang tải &amp; tách đơn...</span>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                            {/* Unmapped (highlighted) */}
                            {unmapped.length > 0 && (
                                <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/60 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                                        <span className="text-sm font-black text-rose-700 uppercase tracking-wider">
                                            Chưa gán NCC (unmapped)
                                        </span>
                                        <span className="ml-auto text-[10px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">
                                            {unmapped.length} dòng
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {unmapped.map((l, idx) => (
                                            <div
                                                key={`${l.part_code}-${idx}`}
                                                className="flex items-center gap-2 text-xs font-bold bg-white/70 border border-rose-100 rounded-lg px-3 py-1.5"
                                            >
                                                <span className="text-slate-700 truncate flex-1 min-w-0">{l.part_code}</span>
                                                <span className="text-rose-600 shrink-0">SL: {l.qty_ordered}</span>
                                                <select
                                                    value=""
                                                    onChange={e => handleAssign(idx, e.target.value)}
                                                    className="shrink-0 text-xs font-bold text-slate-700 bg-white border border-rose-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-rose-300"
                                                >
                                                    <option value="">— Chọn NCC —</option>
                                                    {supplierOptions.map(s => (
                                                        <option key={s} value={s}>
                                                            {s}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Supplier groups */}
                            {supplierGroups.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                    <Boxes size={48} className="mb-4" />
                                    <span className="text-xs font-black uppercase tracking-widest">
                                        Không có dòng nào để tách
                                    </span>
                                </div>
                            ) : (
                                supplierGroups.map(g => (
                                    <div
                                        key={g.supplier}
                                        className="flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-2xl p-4"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                                            <Boxes size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-black text-slate-800 truncate">{g.supplier}</div>
                                            <div className="text-2xs font-bold text-slate-400 mt-0.5">
                                                {g.lines.length} dòng
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-sm font-black text-emerald-600">
                                                {g.totalQty.toLocaleString()}
                                            </div>
                                            <div className="text-2xs font-bold text-slate-400 uppercase tracking-widest">
                                                Tổng SL
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center gap-4 rounded-b-[32px]">
                    <div className="flex-1 min-w-0 text-xs font-bold text-slate-400">
                        {!isLoading && groups.size > 0 && (
                            <span>
                                {groups.size} NCC · {resultMsg ?? ''}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-all"
                        >
                            Đóng
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!canConfirm}
                            title={
                                unmapped.length > 0
                                    ? 'Còn mã chưa gán NCC — không thể tách'
                                    : 'Xác nhận tách & gán NCC'
                            }
                            className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200/50 flex items-center gap-2"
                        >
                            {isSaving ? (
                                <RefreshCw className="animate-spin" size={16} />
                            ) : (
                                <CheckCircle2 size={16} />
                            )}
                            {unmapped.length > 0 ? 'Còn mã chưa gán NCC' : 'Xác nhận tách'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExecutionSplitModal;
