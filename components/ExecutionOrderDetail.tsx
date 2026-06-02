import React, { useCallback, useEffect, useState } from 'react';
import type { SupplierOrder, OrderLine, ReceiptLot } from '../types/execution';
import {
    listOrderLines,
    listReceiptLots,
    updateSupplierOrder,
    upsertReceiptLot,
    recomputeOrderStage,
} from '../utils/supabase/execution';
import { computeOutstanding, computeAgingDays } from '../utils/execution/outstanding';
import LotTimeline from './execution/LotTimeline';

interface Props {
    order: SupplierOrder;
    onClose: () => void;
    onChange?: () => void;
}

interface LineWithLots {
    line: OrderLine;
    lots: ReceiptLot[];
}

// Chỉ lấy phần ngày (YYYY-MM-DD) cho input type="date".
const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

// State của form ghi lô cho từng dòng.
interface LotFormState {
    invoice_no: string;
    invoice_date: string;
    etd_pol: string;
    eta_pod: string;
    port: string;
    expected_wh_date: string;
    actual_wh_date: string;
    warehouse: string;
    qty_received: string;
}

const emptyLotForm: LotFormState = {
    invoice_no: '',
    invoice_date: '',
    etd_pol: '',
    eta_pod: '',
    port: '',
    expected_wh_date: '',
    actual_wh_date: '',
    warehouse: '',
    qty_received: '',
};

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export default function ExecutionOrderDetail({ order, onClose, onChange }: Props) {
    const [rows, setRows] = useState<LineWithLots[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // S2 bind form (header).
    const [externalRef, setExternalRef] = useState(order.external_order_ref ?? '');
    const [orderedAt, setOrderedAt] = useState(toDateInput(order.ordered_at));
    const [savingBind, setSavingBind] = useState(false);

    // S8 receipt forms — keyed theo order_line_id.
    const [lotForms, setLotForms] = useState<Record<string, LotFormState>>({});
    const [savingLot, setSavingLot] = useState<string | null>(null);
    const [closingOrder, setClosingOrder] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const lines = await listOrderLines(order.id);
            const withLots = await Promise.all(
                lines.map(async (line) => ({ line, lots: await listReceiptLots(line.id) })),
            );
            setRows(withLots);
        } catch (e) {
            setError(errMsg(e));
        } finally {
            setLoading(false);
        }
    }, [order.id]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleSaveBind = async () => {
        setSavingBind(true);
        setError(null);
        try {
            await updateSupplierOrder(order.id, {
                external_order_ref: externalRef.trim() || null,
                ordered_at: orderedAt || null,
            });
            onChange?.();
        } catch (e) {
            setError(errMsg(e));
        } finally {
            setSavingBind(false);
        }
    };

    const getForm = (lineId: string): LotFormState => lotForms[lineId] ?? emptyLotForm;

    const setForm = (lineId: string, patch: Partial<LotFormState>) => {
        setLotForms((prev) => ({ ...prev, [lineId]: { ...getForm(lineId), ...patch } }));
    };

    const handleSaveLot = async (lineId: string) => {
        const form = getForm(lineId);
        if (!form.invoice_no.trim()) {
            setError('Cần nhập số hóa đơn (invoice) để ghi lô.');
            return;
        }
        setSavingLot(lineId);
        setError(null);
        try {
            await upsertReceiptLot({
                order_line_id: lineId,
                invoice_no: form.invoice_no.trim(),
                invoice_date: form.invoice_date || null,
                etd_pol: form.etd_pol || null,
                eta_pod: form.eta_pod || null,
                port: form.port.trim() || null,
                expected_wh_date: form.expected_wh_date || null,
                actual_wh_date: form.actual_wh_date || null,
                warehouse: form.warehouse.trim() || null,
                qty_received: Number(form.qty_received) || 0,
            });
            await recomputeOrderStage(order.id);
            setLotForms((prev) => ({ ...prev, [lineId]: emptyLotForm }));
            await load();
            onChange?.();
        } catch (e) {
            setError(errMsg(e));
        } finally {
            setSavingLot(null);
        }
    };

    const handleCloseOrder = async () => {
        setClosingOrder(true);
        setError(null);
        try {
            await updateSupplierOrder(order.id, { stage: 'S9_DONE' });
            onChange?.();
        } catch (e) {
            setError(errMsg(e));
        } finally {
            setClosingOrder(false);
        }
    };

    const aging = computeAgingDays(order.ordered_at, new Date());

    // Tổng tồn nợ toàn đơn — chặn "Đóng đơn" khi còn nợ.
    const totalOutstanding = rows.reduce(
        (s, { line, lots }) => s + computeOutstanding(line.qty_ordered, lots),
        0,
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-2 md:p-3 overflow-hidden">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose} />

            <div className="relative w-full max-w-[1400px] h-[96vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/20">
                {/* ═══ HEADER ═══ */}
                <div
                    className="flex items-center justify-between gap-4 px-5 shrink-0 h-14 text-white"
                    style={{ background: 'linear-gradient(to right, #0f172a 0%, #0f2744 55%, #0f172a 100%)' }}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-black truncate">{order.supplier}</span>
                        <span className="bg-blue-500/30 text-blue-100 text-2xs font-bold px-2 py-0.5 rounded-full">
                            {order.stage}
                        </span>
                        {order.po_region_no && (
                            <span className="text-xs text-slate-300 truncate">PO {order.po_region_no}</span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-300 hover:text-white shrink-0"
                    >
                        <i className="fas fa-xmark text-base" />
                    </button>
                </div>

                {/* ═══ S2 BIND FORM ═══ */}
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
                    <div className="text-2xs font-black text-slate-500 uppercase tracking-widest mb-2">
                        S2 — Gắn đơn NCC
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Mã đơn NCC</span>
                            <input
                                type="text"
                                value={externalRef}
                                onChange={(e) => setExternalRef(e.target.value)}
                                placeholder="external_order_ref"
                                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Ngày đặt</span>
                            <input
                                type="date"
                                value={orderedAt}
                                onChange={(e) => setOrderedAt(e.target.value)}
                                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                        </label>
                        <button
                            onClick={() => void handleSaveBind()}
                            disabled={savingBind}
                            className="text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-1.5 transition-colors"
                        >
                            {savingBind ? 'Đang lưu…' : 'Lưu'}
                        </button>
                        {aging !== null && (
                            <span className="text-xs text-slate-500 ml-auto">
                                Tuổi đơn: <span className="font-black text-slate-700">{aging}</span> ngày
                            </span>
                        )}
                        <button
                            onClick={() => void handleCloseOrder()}
                            disabled={closingOrder || totalOutstanding > 0}
                            title={totalOutstanding > 0 ? 'Còn nợ — chưa thể đóng' : 'Đóng đơn'}
                            className={`text-sm font-bold rounded-lg px-4 py-1.5 transition-colors text-white ${
                                aging === null ? 'ml-auto' : ''
                            } ${
                                totalOutstanding > 0
                                    ? 'bg-slate-300 cursor-not-allowed'
                                    : 'bg-slate-800 hover:bg-slate-900'
                            } disabled:opacity-60`}
                        >
                            {closingOrder ? 'Đang đóng…' : 'Đóng đơn'}
                        </button>
                    </div>
                </div>

                {/* ═══ ERROR BANNER ═══ */}
                {error && (
                    <div className="px-5 py-2 bg-rose-50 border-b border-rose-100 text-rose-700 text-sm flex items-center gap-2 shrink-0">
                        <i className="fas fa-triangle-exclamation" />
                        <span className="break-words">{error}</span>
                    </div>
                )}

                {/* ═══ BODY ═══ */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                            <i className="fas fa-spinner fa-spin mr-2" /> Đang tải dòng đơn…
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                            Không có dòng nào trong đơn này.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {rows.map(({ line, lots }) => {
                                const received = lots.reduce((s, l) => s + (l.qty_received || 0), 0);
                                const outstanding = computeOutstanding(line.qty_ordered, lots);
                                const form = getForm(line.id);
                                return (
                                    <div
                                        key={line.id}
                                        className="border border-slate-200 rounded-xl overflow-hidden"
                                    >
                                        {/* Line header */}
                                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-slate-50 px-4 py-2.5 border-b border-slate-100">
                                            <span className="font-black text-slate-800 text-sm">{line.part_code}</span>
                                            {line.name_vi && (
                                                <span className="text-xs text-slate-500 truncate max-w-[280px]">
                                                    {line.name_vi}
                                                </span>
                                            )}
                                            <span className="text-xs text-slate-500 ml-auto">
                                                SL đặt: <span className="font-black text-slate-700">{line.qty_ordered}</span>
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                Σ nhận: <span className="font-black text-emerald-600">{received}</span>
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                Tồn nợ:{' '}
                                                <span
                                                    className={`font-black ${outstanding > 0 ? 'text-rose-600' : 'text-slate-400'}`}
                                                >
                                                    {outstanding}
                                                </span>
                                            </span>
                                            {outstanding > 0 && aging !== null && (
                                                <span className="text-2xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                                    Nợ {aging} ngày
                                                </span>
                                            )}
                                            {received > line.qty_ordered && (
                                                <span className="text-2xs font-bold text-white bg-rose-600 px-2 py-0.5 rounded-full">
                                                    Lệch: nhận &gt; đặt
                                                </span>
                                            )}
                                        </div>

                                        {/* Lots — mỗi lô là một timeline mốc tiến độ */}
                                        <div className="px-4 py-2 space-y-2">
                                            {lots.length === 0 ? (
                                                <div className="text-xs text-slate-400 py-2">Chưa có lô hàng về.</div>
                                            ) : (
                                                lots.map((lot) => (
                                                    <div
                                                        key={lot.id}
                                                        className="border border-slate-100 rounded-lg px-3 py-1.5"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-2xs font-bold text-slate-500">
                                                                {lot.invoice_no ?? 'Lô chưa có invoice'}
                                                            </span>
                                                            <span className="text-2xs font-bold text-slate-600">
                                                                SL nhận:{' '}
                                                                <span className="text-emerald-600">{lot.qty_received}</span>
                                                            </span>
                                                        </div>
                                                        <LotTimeline lot={lot} />
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* S8 receipt entry */}
                                        <div className="px-4 py-2.5 bg-slate-50/60 border-t border-slate-100">
                                            <div className="text-2xs font-black text-slate-400 uppercase tracking-widest mb-2">
                                                S8 — Ghi lô hàng về
                                            </div>
                                            <div className="flex flex-wrap items-end gap-2">
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">Invoice *</span>
                                                    <input
                                                        type="text"
                                                        value={form.invoice_no}
                                                        onChange={(e) => setForm(line.id, { invoice_no: e.target.value })}
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">Ngày invoice</span>
                                                    <input
                                                        type="date"
                                                        value={form.invoice_date}
                                                        onChange={(e) => setForm(line.id, { invoice_date: e.target.value })}
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">ETD</span>
                                                    <input
                                                        type="date"
                                                        value={form.etd_pol}
                                                        onChange={(e) => setForm(line.id, { etd_pol: e.target.value })}
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">ETA</span>
                                                    <input
                                                        type="date"
                                                        value={form.eta_pod}
                                                        onChange={(e) => setForm(line.id, { eta_pod: e.target.value })}
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">Cảng</span>
                                                    <input
                                                        type="text"
                                                        value={form.port}
                                                        onChange={(e) => setForm(line.id, { port: e.target.value })}
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-28 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">Về kho dự kiến</span>
                                                    <input
                                                        type="date"
                                                        value={form.expected_wh_date}
                                                        onChange={(e) =>
                                                            setForm(line.id, { expected_wh_date: e.target.value })
                                                        }
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">Ngày về kho thực tế</span>
                                                    <input
                                                        type="date"
                                                        value={form.actual_wh_date}
                                                        onChange={(e) =>
                                                            setForm(line.id, { actual_wh_date: e.target.value })
                                                        }
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">Kho</span>
                                                    <input
                                                        type="text"
                                                        value={form.warehouse}
                                                        onChange={(e) => setForm(line.id, { warehouse: e.target.value })}
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-28 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-2xs font-bold text-slate-400">SL nhận</span>
                                                    <input
                                                        type="number"
                                                        value={form.qty_received}
                                                        onChange={(e) =>
                                                            setForm(line.id, { qty_received: e.target.value })
                                                        }
                                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-24 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                    />
                                                </label>
                                                <button
                                                    onClick={() => void handleSaveLot(line.id)}
                                                    disabled={savingLot === line.id}
                                                    className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-3 py-2 transition-colors"
                                                >
                                                    {savingLot === line.id ? 'Đang ghi…' : 'Ghi lô'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
