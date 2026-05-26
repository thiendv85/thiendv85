import React from 'react';
import { FaIcon } from './Icon';
import { downloadSampleCSV, SAMPLE_CSVS } from '../utils/sampleCSVs';

interface Props {
    sampleKey: keyof typeof SAMPLE_CSVS | string;
    label?: string;
    variant?: 'default' | 'light' | 'dark';
    className?: string;
}

export const SampleCSVButton = ({ sampleKey, label = 'Mẫu CSV', variant = 'default', className = '' }: Props) => {
    const sample = SAMPLE_CSVS[sampleKey as string];
    const title = sample?.description
        ? `Tải file mẫu: ${sample.description} (${sample.filename})`
        : 'Tải file CSV mẫu';

    const base = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors';
    const styles = variant === 'dark'
        ? 'bg-white/10 border border-white/20 text-white/90 hover:bg-white/20'
        : variant === 'light'
        ? 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
        : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700';

    return (
        <button
            type="button"
            onClick={() => downloadSampleCSV(sampleKey as string)}
            title={title}
            className={`${base} ${styles} ${className}`}
        >
            <FaIcon className="fas fa-file-download text-[11px]" />
            {label}
        </button>
    );
};
