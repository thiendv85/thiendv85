import React from 'react';
import { Typography } from '../../components/Typography';
import { FaIcon } from '../../components/Icon';

export const SectionCard = ({ title, icon, badge, children }: { title: string; icon: string; badge?: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <FaIcon className={`fas ${icon} text-blue-600 text-sm`}  />
            </div>
            <Typography variant="label" className="text-slate-900">{title}</Typography>
            {badge && <span className="ml-auto text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">{badge}</span>}
        </div>
        <div className="p-6">{children}</div>
    </div>
);

export const Field = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-slate-50 last:border-0">
        <div className="sm:w-56 shrink-0">
            <Typography variant="body" className="text-slate-700 font-bold">{label}</Typography>
            {sub && <Typography variant="label" className="text-slate-400 !font-medium normal-case block mt-0.5">{sub}</Typography>}
        </div>
        <div className="flex-1">{children}</div>
    </div>
);

export const NumberInput = ({ value, onChange, min, max, step, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) => (
    <div className="flex items-center gap-2">
        <input
            type="number" value={value} min={min} max={max} step={step || 1}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
        />
        {unit && <span className="text-xs font-bold text-slate-400 uppercase">{unit}</span>}
    </div>
);

export const Select = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <select
        value={value} onChange={e => onChange(e.target.value)}
        className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all cursor-pointer"
    >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
);

export const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) => (
    <div className="flex items-center gap-2">
        <button
            onClick={() => onChange(!value)}
            className={`relative w-10 h-5 rounded-full transition-all ${value ? 'bg-blue-600' : 'bg-slate-200'}`}
        >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? 'left-5' : 'left-0.5'}`} />
        </button>
        {label && <span className="text-sm font-bold text-slate-600">{label}</span>}
    </div>
);

export const ColCheckbox = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void; key?: React.Key }) => (
    <label className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-slate-50 cursor-pointer group">
        <div
            onClick={() => onChange(!value)}
            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${value ? 'bg-blue-600 border-blue-600' : 'border-slate-300 group-hover:border-blue-400'}`}
        >
            {value && <FaIcon className="fas fa-check text-white" style={{ fontSize: '9px' }}  />}
        </div>
        <span className="text-xs font-bold text-slate-600 select-none">{label}</span>
    </label>
);
