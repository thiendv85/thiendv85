import React, { useState } from 'react';
import { FaIcon } from '../../components/Icon';

export interface FilterDropdownProps {
    label: string;
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    icon: string;
}

export const FilterDropdown = ({ label, options, selected, onChange, icon }: FilterDropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const isActive = selected.length > 0;
    // Uses the .bo-dropdown-trigger token (index.css) so every dropdown on the
    // page reads as the same component — onyx idle, dark-glass + bronze rim
    // when ≥1 option is selected.
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="true"
                data-active={isActive}
                className="bo-dropdown-trigger"
            >
                <FaIcon className={`fas ${icon} text-[10px]`} aria-hidden="true" />
                <span>{label}</span>
                {isActive && (
                    <span className="bo-count-pill" aria-label={`${selected.length} đã chọn`}>
                        {selected.length}
                    </span>
                )}
                <FaIcon
                    className={`fas fa-chevron-down text-[8px] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                />
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true"></div>
                    <div
                        className="absolute top-full left-0 mt-1.5 w-64 z-50 animate-in fade-in zoom-in-95 origin-top-left"
                        style={{
                            background: 'var(--bo-surface-raised)',
                            border: '1px solid var(--bo-hairline)',
                            borderRadius: 'var(--bo-radius-md)',
                            boxShadow: 'var(--bo-shadow-tile)',
                            padding: 8,
                        }}
                    >
                        <div className="px-2 py-1.5 mb-1" style={{ borderBottom: '1px solid var(--bo-hairline)' }}>
                            <span
                                className="text-[10px] font-black uppercase tracking-[0.18em]"
                                style={{ color: 'var(--bo-ink-muted)' }}
                            >
                                Lọc theo {label}
                            </span>
                        </div>
                        <div className="max-h-60 overflow-auto custom-scrollbar p-0.5">
                            {options.length > 0 && (
                                <label
                                    className="flex items-center gap-3 px-2.5 py-2 cursor-pointer transition-colors group sticky top-0 z-10"
                                    style={{
                                        background: 'var(--bo-surface-raised)',
                                        borderBottom: '1px solid var(--bo-hairline)',
                                        marginBottom: 2,
                                        borderRadius: 'var(--bo-radius-xs)',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bo-bronze-soft)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bo-surface-raised)')}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.length === options.length && options.length > 0}
                                        onChange={() => {
                                            if (selected.length === options.length) onChange([]);
                                            else onChange([...options]);
                                        }}
                                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--bo-bronze)]"
                                    />
                                    <span
                                        className="text-[11px] font-black uppercase tracking-[0.12em] truncate"
                                        style={{ color: 'var(--bo-bronze-strong)' }}
                                    >
                                        Chọn tất cả
                                    </span>
                                </label>
                            )}
                            {options.map((opt: string) => (
                                <label
                                    key={opt}
                                    className="flex items-center gap-3 px-2.5 py-1.5 cursor-pointer transition-colors group"
                                    style={{ borderRadius: 'var(--bo-radius-xs)' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bo-surface-sunken)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(opt)}
                                        onChange={() => {
                                            const next = selected.includes(opt)
                                                ? selected.filter((s: string) => s !== opt)
                                                : [...selected, opt];
                                            onChange(next);
                                        }}
                                        className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--bo-bronze)]"
                                    />
                                    <span
                                        className="text-[12px] font-semibold truncate"
                                        style={{ color: 'var(--bo-ink)' }}
                                    >
                                        {opt}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div
                            className="px-2 pt-1.5 mt-1 flex justify-between items-center"
                            style={{ borderTop: '1px solid var(--bo-hairline)' }}
                        >
                            <button
                                type="button"
                                onClick={() => onChange([])}
                                className="text-[10px] font-black uppercase tracking-[0.16em] hover:underline focus-visible:outline-none rounded px-1"
                                style={{ color: 'var(--bo-accent)' }}
                            >
                                Xoá
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="text-[10px] font-black uppercase tracking-[0.16em] hover:underline focus-visible:outline-none rounded px-1"
                                style={{ color: 'var(--bo-ink)' }}
                            >
                                Hoàn tất
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
