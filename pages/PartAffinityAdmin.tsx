import React, { useState, useMemo, useRef } from 'react';
import { usePartAffinity } from '../hooks/usePartAffinity';
import { upsertPartAffinityPair, deletePartAffinityPair, bulkUpsertPartAffinity } from '../utils/supabase';
import { parsePartAffinityCSV } from '../utils/csvParser';
import { FaIcon } from '../components/Icon';
import { SampleCSVButton } from '../components/SampleCSVButton';
import type { PartAffinityPair } from '../types/inventory';

export const PartAffinityAdmin = ({ embedded = false }: { embedded?: boolean } = {}) => {
    const { pairs, isLoading, refresh } = usePartAffinity();
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'mandatory' | 'recommended'>('all');
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<PartAffinityPair | null>(null);
    const [formA, setFormA] = useState('');
    const [formB, setFormB] = useState('');
    const [formType, setFormType] = useState<'mandatory' | 'recommended'>('recommended');
    const [formScore, setFormScore] = useState(50);
    const [formNote, setFormNote] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        const t = search.trim().toUpperCase();
        return pairs.filter(p => {
            if (filterType !== 'all' && p.type !== filterType) return false;
            if (!t) return true;
            return p.partA.includes(t) || p.partB.includes(t);
        });
    }, [pairs, search, filterType]);

    const showToastMsg = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setEditing(null);
        setFormA('');
        setFormB('');
        setFormType('recommended');
        setFormScore(50);
        setFormNote('');
        setShowForm(true);
    };
    const openEdit = (p: PartAffinityPair) => {
        setEditing(p);
        setFormA(p.partA);
        setFormB(p.partB);
        setFormType(p.type);
        setFormScore(p.score);
        setFormNote(p.note || '');
        setShowForm(true);
    };

    const handleSave = async () => {
        const res = await upsertPartAffinityPair({
            partA: formA,
            partB: formB,
            type: formType,
            score: formScore,
            note: formNote || undefined,
        });
        if (res.success) {
            showToastMsg('Đã lưu');
            setShowForm(false);
            refresh();
        } else {
            showToastMsg(`Lỗi: ${res.error}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Xoá pair này?')) return;
        const ok = await deletePartAffinityPair(id);
        if (ok) {
            showToastMsg('Đã xoá');
            refresh();
        } else showToastMsg('Xoá thất bại');
    };

    const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = parsePartAffinityCSV(text);
        if (parsed.length === 0) {
            showToastMsg('CSV không có dòng hợp lệ');
            return;
        }
        const res = await bulkUpsertPartAffinity(parsed);
        if (res.error) showToastMsg(`Lỗi: ${res.error}`);
        else showToastMsg(`Đã import ${res.inserted} (skip ${res.skipped})`);
        e.target.value = '';
        refresh();
    };

    return (
        <div className={`animate-fadeIn space-y-4 ${embedded ? '' : 'p-6'}`}>
            {!embedded && (
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl text-white p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-black tracking-tight uppercase">Mã liên quan</h1>
                            <p className="text-white/50 text-xs">Pair A↔B — mandatory/recommended</p>
                        </div>
                        <div className="flex gap-2">
                            <SampleCSVButton sampleKey="part-affinity" variant="dark" label="Mẫu CSV" />
                            <button
                                onClick={() => fileRef.current?.click()}
                                className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white/90 text-sm font-bold"
                            >
                                <FaIcon className="fas fa-upload mr-2" />
                                CSV
                            </button>
                            <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleCSV} />
                            <button onClick={openNew} className="px-3 py-2 text-sm lg-btn lg-btn-blue">
                                <FaIcon className="fas fa-plus mr-2" />
                                Thêm pair
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {embedded && (
                <div className="flex justify-end gap-2">
                    <SampleCSVButton sampleKey="part-affinity" />
                    <button
                        onClick={() => fileRef.current?.click()}
                        className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
                    >
                        <FaIcon className="fas fa-upload mr-2" />
                        CSV
                    </button>
                    <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleCSV} />
                    <button onClick={openNew} className="px-3 py-2 text-sm lg-btn lg-btn-blue">
                        <FaIcon className="fas fa-plus mr-2" />
                        Thêm pair
                    </button>
                </div>
            )}

            <div className="flex gap-2 items-center">
                <input
                    placeholder="Tìm mã..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 max-w-xs"
                />
                {(['all', 'mandatory', 'recommended'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setFilterType(t)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold ${filterType === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                    >
                        {t === 'all' ? 'Tất cả' : t === 'mandatory' ? 'Bắt buộc' : 'Khuyến nghị'}
                    </button>
                ))}
                <span className="text-sm text-slate-500 ml-auto">
                    {filtered.length} / {pairs.length} pair
                </span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left p-3 font-bold text-slate-600">Part A</th>
                            <th className="text-left p-3 font-bold text-slate-600">Part B</th>
                            <th className="text-left p-3 font-bold text-slate-600">Loại</th>
                            <th className="text-right p-3 font-bold text-slate-600">Score</th>
                            <th className="text-left p-3 font-bold text-slate-600">Ghi chú</th>
                            <th className="text-right p-3 font-bold text-slate-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoading && (
                            <tr>
                                <td colSpan={6} className="p-6 text-center text-slate-400">
                                    Đang nạp...
                                </td>
                            </tr>
                        )}
                        {!isLoading && filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-6 text-center text-slate-400">
                                    Chưa có pair nào
                                </td>
                            </tr>
                        )}
                        {filtered.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50">
                                <td className="p-3 font-mono font-bold text-slate-800">{p.partA}</td>
                                <td className="p-3 font-mono font-bold text-slate-800">{p.partB}</td>
                                <td className="p-3">
                                    <span
                                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${p.type === 'mandatory' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}
                                    >
                                        {p.type === 'mandatory' ? 'BẮT BUỘC' : 'KHUYẾN NGHỊ'}
                                    </span>
                                </td>
                                <td className="p-3 text-right tabular-nums">
                                    {p.type === 'recommended' ? p.score : '—'}
                                </td>
                                <td className="p-3 text-slate-600 text-xs">{p.note || '—'}</td>
                                <td className="p-3 text-right">
                                    <button
                                        onClick={() => openEdit(p)}
                                        className="text-blue-600 hover:underline text-xs mr-2"
                                    >
                                        Sửa
                                    </button>
                                    <button
                                        onClick={() => handleDelete(p.id)}
                                        className="text-rose-600 hover:underline text-xs"
                                    >
                                        Xoá
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
                    onClick={() => setShowForm(false)}
                >
                    <div
                        className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3"
                        onClick={e => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-black">{editing ? 'Sửa pair' : 'Thêm pair mới'}</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs font-bold text-slate-600">
                                Part A
                                <input
                                    value={formA}
                                    onChange={e => setFormA(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                                />
                            </label>
                            <label className="text-xs font-bold text-slate-600">
                                Part B
                                <input
                                    value={formB}
                                    onChange={e => setFormB(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                                />
                            </label>
                        </div>
                        <label className="text-xs font-bold text-slate-600 block">
                            Loại
                            <div className="flex gap-2 mt-1">
                                {(['mandatory', 'recommended'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setFormType(t)}
                                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold ${formType === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                                    >
                                        {t === 'mandatory' ? 'Bắt buộc' : 'Khuyến nghị'}
                                    </button>
                                ))}
                            </div>
                        </label>
                        {formType === 'recommended' && (
                            <label className="text-xs font-bold text-slate-600 block">
                                Score: {formScore}
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={formScore}
                                    onChange={e => setFormScore(parseInt(e.target.value))}
                                    className="w-full mt-1"
                                />
                            </label>
                        )}
                        <label className="text-xs font-bold text-slate-600 block">
                            Ghi chú
                            <textarea
                                value={formNote}
                                onChange={e => setFormNote(e.target.value)}
                                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg"
                                rows={2}
                            />
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setShowForm(false)}
                                className="px-3 py-2 text-sm font-bold text-slate-600"
                            >
                                Huỷ
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formA.trim() || !formB.trim()}
                                className="px-3 py-2 text-sm disabled:opacity-50 lg-btn lg-btn-blue"
                            >
                                Lưu
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm">
                    {toast}
                </div>
            )}
        </div>
    );
};

export default PartAffinityAdmin;
