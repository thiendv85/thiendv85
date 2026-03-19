import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Save, AlertCircle, Search } from 'lucide-react';
import { Typography } from './Typography';
import { SupersessionMapping } from '../utils/supersessionGraph';
import { InventoryItem } from '../types/inventory';

interface SupersessionEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (oldPart: string, newPart: string, interchangeable: boolean) => void;
    initialData?: SupersessionMapping | null;
    existingMappings: SupersessionMapping[];
    items: InventoryItem[];
}

export const SupersessionEditModal: React.FC<SupersessionEditModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    existingMappings,
    items
}) => {
    const [oldPart, setOldPart] = useState('');
    const [newPart, setNewPart] = useState('');
    const [interchangeable, setInterchangeable] = useState(false);
    const [error, setError] = useState('');

    // Autocomplete state
    const [showOldPartSuggestions, setShowOldPartSuggestions] = useState(false);
    const [showNewPartSuggestions, setShowNewPartSuggestions] = useState(false);

    const oldPartRef = useRef<HTMLDivElement>(null);
    const newPartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setOldPart(initialData.oldPart);
                setNewPart(initialData.newPart);
                setInterchangeable(initialData.interchangeable);
            } else {
                setOldPart('');
                setNewPart('');
                setInterchangeable(false);
            }
            setError('');
        }
    }, [isOpen, initialData]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (oldPartRef.current && !oldPartRef.current.contains(event.target as Node)) {
                setShowOldPartSuggestions(false);
            }
            if (newPartRef.current && !newPartRef.current.contains(event.target as Node)) {
                setShowNewPartSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const oldSuggestions = useMemo(() => {
        if (!oldPart || oldPart.length < 1) return [];
        const term = oldPart.toUpperCase();
        return items.filter(i =>
            i.ItemCode.toUpperCase().includes(term) ||
            (i.ItemName && i.ItemName.toUpperCase().includes(term))
        ).slice(0, 10);
    }, [oldPart, items]);

    const newSuggestions = useMemo(() => {
        if (!newPart || newPart.length < 1) return [];
        const term = newPart.toUpperCase();
        return items.filter(i =>
            i.ItemCode.toUpperCase().includes(term) ||
            (i.ItemName && i.ItemName.toUpperCase().includes(term))
        ).slice(0, 10);
    }, [newPart, items]);

    if (!isOpen) return null;

    const handleSave = () => {
        const op = oldPart.trim();
        const np = newPart.trim();

        if (!op || !np) {
            setError('Vui lòng nhập đầy đủ mã cũ và mã mới.');
            return;
        }

        if (op === np) {
            setError('Mã cũ và mã mới không được trùng nhau.');
            return;
        }

        const isDuplicate = existingMappings.some(m =>
            m.oldPart === op &&
            m.newPart === np &&
            m !== initialData
        );

        if (isDuplicate) {
            setError('Liên kết này đã tồn tại trong danh sách.');
            return;
        }

        onSave(op, np, interchangeable);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-visible flex flex-col border border-white/20 relative">
                {/* Header with rounded top corners to fix square grey border issue */}
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-slate-50/50 rounded-t-[32px]">
                    <div>
                        <Typography variant="h2">
                            {initialData ? 'Chỉnh sửa Mapping' : 'Thêm Mapping Mới'}
                        </Typography>
                        <Typography variant="label" className="mt-1">
                            Cấu hình chuỗi thay thế phụ tùng
                        </Typography>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 w-10 h-10 rounded-full transition-all flex items-center justify-center"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-8 space-y-8">
                    {error && (
                        <div className="flex gap-3 items-center text-sm font-bold text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-shake">
                            <AlertCircle size={20} className="shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* OLD PART FIELD */}
                    <div className="relative" ref={oldPartRef}>
                        <Typography variant="label" className="mb-3 px-1">Mã cũ (Old Part)</Typography>
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                            <input
                                type="text"
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all uppercase placeholder:text-slate-300"
                                placeholder="NHẬP MÃ CŨ..."
                                value={oldPart}
                                onChange={e => { setOldPart(e.target.value); setShowOldPartSuggestions(true); }}
                                onFocus={() => setShowOldPartSuggestions(true)}
                                disabled={!!initialData}
                            />
                        </div>
                        {showOldPartSuggestions && oldSuggestions.length > 0 && (
                            <div className="absolute z-[120] left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar animate-fadeIn">
                                {oldSuggestions.map(item => (
                                    <div
                                        key={item.ItemCode}
                                        className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer flex flex-col transition-colors border-b border-slate-50 last:border-0"
                                        onClick={() => { setOldPart(item.ItemCode); setShowOldPartSuggestions(false); }}
                                    >
                                        <Typography variant="mono" className="text-slate-800">{item.ItemCode}</Typography>
                                        <Typography variant="mono-sm" className="truncate">{item.ItemName}</Typography>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* NEW PART FIELD */}
                    <div className="relative" ref={newPartRef}>
                        <Typography variant="label" className="mb-3 px-1">Mã mới (New Part)</Typography>
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                            <input
                                type="text"
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all uppercase placeholder:text-slate-300"
                                placeholder="NHẬP MÃ MỚI..."
                                value={newPart}
                                onChange={e => { setNewPart(e.target.value); setShowNewPartSuggestions(true); }}
                                onFocus={() => setShowNewPartSuggestions(true)}
                            />
                        </div>
                        {showNewPartSuggestions && newSuggestions.length > 0 && (
                            <div className="absolute z-[120] left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar animate-fadeIn">
                                {newSuggestions.map(item => (
                                    <div
                                        key={item.ItemCode}
                                        className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer flex flex-col transition-colors border-b border-slate-50 last:border-0"
                                        onClick={() => { setNewPart(item.ItemCode); setShowNewPartSuggestions(false); }}
                                    >
                                        <Typography variant="mono" className="text-slate-800">{item.ItemCode}</Typography>
                                        <Typography variant="mono-sm" className="truncate">{item.ItemName}</Typography>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 cursor-pointer p-6 rounded-2xl border border-slate-200 hover:bg-slate-50 hover:border-emerald-300 transition-all group" onClick={() => setInterchangeable(!interchangeable)}>
                        <div className="relative flex-shrink-0">
                            <div className={`block w-12 h-7 rounded-full transition-colors ${interchangeable ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                            <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform ${interchangeable ? 'translate-x-5' : ''}`}></div>
                        </div>
                        <div className="flex-1">
                            <Typography variant="h3" className="text-slate-700 group-hover:text-emerald-700 transition-colors">
                                Hai chiều (Interchangeable)
                            </Typography>
                            <Typography variant="label" className="mt-0.5 lowercase first-letter:uppercase">
                                Hai mã có thể thay thế qua lại cho nhau
                            </Typography>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-4 rounded-b-[32px]">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-all font-sans"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-8 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 font-sans"
                    >
                        <Save size={16} /> Lưu Mapping
                    </button>
                </div>
            </div>
        </div>
    );
};
