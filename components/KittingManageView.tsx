import React, { useState, useMemo, useRef } from 'react';
import { KittingDefinition } from '../types/inventory';
import { FaIcon } from './Icon';
import { SampleCSVButton } from './SampleCSVButton';
import { parseKittingCSV } from '../utils/csvParser';
import { saveToCloudStorage } from '../utils/supabase';

interface Props {
    kittingDefs: KittingDefinition[];
    onChange: (defs: KittingDefinition[]) => void;
}

const emptyRow = (): KittingDefinition => ({
    SetPartsCode: '',
    SetPartsName: '',
    ItemCode: '',
    ItemNameEng: '',
    QtyRequired: 1,
    ModelCar: '',
    EngineCode: '',
    UnitPrice: 0,
});

export const KittingManageView = ({ kittingDefs, onChange }: Props) => {
    const [search, setSearch] = useState('');
    const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<{ idx: number; row: KittingDefinition } | null>(null);
    const [showAddSet, setShowAddSet] = useState(false);
    const [newSet, setNewSet] = useState({ code: '', name: '', model: '', engine: '' });
    const [toast, setToast] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const showToastMsg = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    // Group rows theo SetPartsCode
    const grouped = useMemo(() => {
        const map = new Map<string, { setName: string; modelCar: string; engineCode: string; components: Array<{ idx: number; row: KittingDefinition }> }>();
        kittingDefs.forEach((row, idx) => {
            const code = row.SetPartsCode || '(không mã)';
            if (!map.has(code)) {
                map.set(code, {
                    setName: row.SetPartsName || '',
                    modelCar: row.ModelCar || '',
                    engineCode: row.EngineCode || '',
                    components: [],
                });
            }
            map.get(code)!.components.push({ idx, row });
        });
        return Array.from(map.entries()).map(([code, info]) => ({ code, ...info }));
    }, [kittingDefs]);

    const filtered = useMemo(() => {
        const t = search.trim().toUpperCase();
        if (!t) return grouped;
        return grouped.filter(g =>
            g.code.toUpperCase().includes(t) ||
            g.setName.toUpperCase().includes(t) ||
            g.modelCar.toUpperCase().includes(t) ||
            g.components.some(c => (c.row.ItemCode || '').toUpperCase().includes(t))
        );
    }, [grouped, search]);

    const toggleExpand = (code: string) => {
        setExpandedSets(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const addSet = () => {
        if (!newSet.code.trim()) { showToastMsg('Mã gói không được rỗng'); return; }
        const row: KittingDefinition = {
            SetPartsCode: newSet.code.trim().toUpperCase(),
            SetPartsName: newSet.name.trim() || newSet.code.trim().toUpperCase(),
            ItemCode: '',
            QtyRequired: 1,
            ModelCar: newSet.model.trim(),
            EngineCode: newSet.engine.trim(),
            UnitPrice: 0,
        };
        onChange([...kittingDefs, row]);
        setExpandedSets(prev => new Set([...prev, row.SetPartsCode]));
        setShowAddSet(false);
        setNewSet({ code: '', name: '', model: '', engine: '' });
        showToastMsg('Đã thêm gói');
    };

    const addComponent = (setCode: string) => {
        const ref = kittingDefs.find(r => r.SetPartsCode === setCode);
        if (!ref) return;
        const row: KittingDefinition = {
            ...emptyRow(),
            SetPartsCode: ref.SetPartsCode,
            SetPartsName: ref.SetPartsName,
            ModelCar: ref.ModelCar,
            EngineCode: ref.EngineCode,
        };
        const newDefs = [...kittingDefs, row];
        onChange(newDefs);
        setEditing({ idx: newDefs.length - 1, row });
    };

    const saveEdit = () => {
        if (!editing) return;
        if (!editing.row.ItemCode.trim()) { showToastMsg('ItemCode không được rỗng'); return; }
        const next = [...kittingDefs];
        next[editing.idx] = { ...editing.row, ItemCode: editing.row.ItemCode.trim().toUpperCase() };
        onChange(next);
        setEditing(null);
        showToastMsg('Đã lưu');
    };

    const deleteRow = (idx: number) => {
        if (!confirm('Xoá dòng này?')) return;
        onChange(kittingDefs.filter((_, i) => i !== idx));
    };

    const deleteSet = (setCode: string) => {
        if (!confirm(`Xoá toàn bộ gói ${setCode}?`)) return;
        onChange(kittingDefs.filter(r => r.SetPartsCode !== setCode));
    };

    const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = parseKittingCSV(text);
        if (parsed.length === 0) { showToastMsg('CSV không có dòng hợp lệ'); return; }
        // Merge: replace existing rows hoặc append?
        if (kittingDefs.length > 0 && !confirm(`Đã có ${kittingDefs.length} dòng. Thay thế toàn bộ?`)) {
            // Append mode
            onChange([...kittingDefs, ...parsed]);
            showToastMsg(`Đã thêm ${parsed.length} dòng`);
        } else {
            onChange(parsed);
            showToastMsg(`Đã nạp ${parsed.length} dòng`);
        }
        e.target.value = '';
    };

    const handleSaveCloud = async () => {
        setSaving(true);
        try {
            const ok = await saveToCloudStorage('kitting_draft', kittingDefs);
            showToastMsg(ok ? 'Đã lưu cloud' : 'Lưu cloud thất bại');
        } catch (e: any) {
            showToastMsg(`Lỗi: ${e?.message || e}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4 animate-fadeIn">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <input
                    placeholder="Tìm mã gói / tên / mã hàng..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 max-w-sm"
                />
                <span className="text-sm text-slate-500">{filtered.length} gói · {kittingDefs.length} dòng</span>
                <div className="ml-auto flex gap-2">
                    <SampleCSVButton sampleKey="kitting" />
                    <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleCSV} />
                    <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50">
                        <FaIcon className="fas fa-upload mr-2" />Import CSV
                    </button>
                    <button onClick={() => setShowAddSet(true)} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">
                        <FaIcon className="fas fa-plus mr-2" />Thêm gói mới
                    </button>
                    <button onClick={handleSaveCloud} disabled={saving || kittingDefs.length === 0} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
                        <FaIcon className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} mr-2`} />Lưu Cloud
                    </button>
                </div>
            </div>

            {/* List sets */}
            <div className="space-y-2">
                {filtered.length === 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
                        {kittingDefs.length === 0 ? 'Chưa có gói nào. Bấm "Thêm gói mới" hoặc Import CSV.' : 'Không khớp tìm kiếm.'}
                    </div>
                )}
                {filtered.map(g => {
                    const expanded = expandedSets.has(g.code);
                    const totalQty = g.components.reduce((sum, c) => sum + (c.row.QtyRequired || 0), 0);
                    const totalValue = g.components.reduce((sum, c) => sum + (c.row.QtyRequired || 0) * (c.row.UnitPrice || 0), 0);
                    return (
                        <div key={g.code} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer" onClick={() => toggleExpand(g.code)}>
                                <FaIcon className={`fas fa-chevron-${expanded ? 'down' : 'right'} text-slate-400`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm font-black text-blue-700">{g.code}</span>
                                        <span className="text-sm text-slate-700">— {g.setName}</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5 flex gap-3">
                                        {g.modelCar && <span><FaIcon className="fas fa-car mr-1" />{g.modelCar}</span>}
                                        {g.engineCode && <span><FaIcon className="fas fa-cog mr-1" />{g.engineCode}</span>}
                                        <span>{g.components.length} linh kiện · qty {totalQty}</span>
                                        {totalValue > 0 && <span className="font-semibold">{(totalValue / 1e6).toFixed(2)}M</span>}
                                    </div>
                                </div>
                                <button onClick={e => { e.stopPropagation(); addComponent(g.code); }} className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1">+ Linh kiện</button>
                                <button onClick={e => { e.stopPropagation(); deleteSet(g.code); }} className="text-xs font-bold text-rose-600 hover:text-rose-800 px-2 py-1">Xoá gói</button>
                            </div>

                            {expanded && (
                                <div className="border-t border-slate-100 bg-slate-50/30">
                                    <table className="w-full text-xs">
                                        <thead className="text-slate-500 bg-slate-50">
                                            <tr>
                                                <th className="text-left p-2 font-bold">Mã hàng</th>
                                                <th className="text-left p-2 font-bold">Tên (Eng)</th>
                                                <th className="text-right p-2 font-bold">Qty</th>
                                                <th className="text-right p-2 font-bold">Đơn giá</th>
                                                <th className="text-right p-2 font-bold">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {g.components.filter(c => c.row.ItemCode).map(c => (
                                                <tr key={c.idx} className="border-t border-slate-100 hover:bg-white">
                                                    <td className="p-2 font-mono font-bold text-slate-800">{c.row.ItemCode}</td>
                                                    <td className="p-2 text-slate-600">{c.row.ItemNameEng || '—'}</td>
                                                    <td className="p-2 text-right tabular-nums">{c.row.QtyRequired}</td>
                                                    <td className="p-2 text-right tabular-nums">{(c.row.UnitPrice || 0).toLocaleString('vi-VN')}</td>
                                                    <td className="p-2 text-right">
                                                        <button onClick={() => setEditing({ idx: c.idx, row: { ...c.row } })} className="text-blue-600 hover:underline mr-2">Sửa</button>
                                                        <button onClick={() => deleteRow(c.idx)} className="text-rose-600 hover:underline">Xoá</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {g.components.filter(c => c.row.ItemCode).length === 0 && (
                                                <tr><td colSpan={5} className="p-3 text-center text-slate-400">Chưa có linh kiện. Bấm "+ Linh kiện" để thêm.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Add Set Modal */}
            {showAddSet && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAddSet(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-black">Thêm gói mới</h2>
                        <label className="text-xs font-bold text-slate-600 block">
                            Mã gói (SetPartsCode)
                            <input value={newSet.code} onChange={e => setNewSet({ ...newSet, code: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
                        </label>
                        <label className="text-xs font-bold text-slate-600 block">
                            Tên gói
                            <input value={newSet.name} onChange={e => setNewSet({ ...newSet, name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg" />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs font-bold text-slate-600">
                                Model xe
                                <input value={newSet.model} onChange={e => setNewSet({ ...newSet, model: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg" />
                            </label>
                            <label className="text-xs font-bold text-slate-600">
                                Engine code
                                <input value={newSet.engine} onChange={e => setNewSet({ ...newSet, engine: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setShowAddSet(false)} className="px-3 py-2 text-sm font-bold text-slate-600">Huỷ</button>
                            <button onClick={addSet} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">Tạo</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Row Modal */}
            {editing && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-3" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-black">Linh kiện trong gói {editing.row.SetPartsCode}</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs font-bold text-slate-600">
                                Mã hàng (ItemCode)
                                <input value={editing.row.ItemCode} onChange={e => setEditing({ ...editing, row: { ...editing.row, ItemCode: e.target.value } })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
                            </label>
                            <label className="text-xs font-bold text-slate-600">
                                Tên (Eng)
                                <input value={editing.row.ItemNameEng || ''} onChange={e => setEditing({ ...editing, row: { ...editing.row, ItemNameEng: e.target.value } })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg" />
                            </label>
                            <label className="text-xs font-bold text-slate-600">
                                Số lượng cần (Qty)
                                <input type="number" min={1} value={editing.row.QtyRequired} onChange={e => setEditing({ ...editing, row: { ...editing.row, QtyRequired: Math.max(1, parseInt(e.target.value) || 1) } })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg tabular-nums" />
                            </label>
                            <label className="text-xs font-bold text-slate-600">
                                Đơn giá
                                <input type="number" min={0} value={editing.row.UnitPrice || 0} onChange={e => setEditing({ ...editing, row: { ...editing.row, UnitPrice: Math.max(0, parseFloat(e.target.value) || 0) } })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg tabular-nums" />
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm font-bold text-slate-600">Huỷ</button>
                            <button onClick={saveEdit} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm z-50">
                    {toast}
                </div>
            )}
        </div>
    );
};
