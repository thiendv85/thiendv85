
import React, { useState, useRef, useCallback } from 'react';
import { 
    Upload, 
    FileText, 
    X, 
    CheckCircle, 
    AlertTriangle, 
    AlertCircle, 
    Loader2, 
    ArrowRight,
    FileType
} from 'lucide-react';
import { useLanguage } from '../utils/i18n';
import { SupersessionGraph, SupersessionMapping } from '../utils/supersessionGraph';
import { parseSupersessionMappingCSV } from '../utils/csvParser';
import { SampleCSVButton } from './SampleCSVButton';

interface SupersessionCSVUploadProps {
    itemCodes: string[];
    onImportSuccess: (graph: SupersessionGraph, mappings: SupersessionMapping[]) => void;
    onImportError?: (errors: string[]) => void;
    onCancel?: () => void;
}

type UploadStatus = 'IDLE' | 'PREVIEW' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

export const SupersessionCSVUpload: React.FC<SupersessionCSVUploadProps> = ({ 
    itemCodes, 
    onImportSuccess, 
    onImportError,
    onCancel 
}) => {
    const { t } = useLanguage();
    const [status, setStatus] = useState<UploadStatus>('IDLE');
    const [file, setFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [mappings, setMappings] = useState<SupersessionMapping[]>([]);
    const [graphResult, setGraphResult] = useState<SupersessionGraph | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // --- HANDLERS ---

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const processFile = (file: File) => {
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            alert(t('ss_error_format'));
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert("File size too large (Max 5MB)");
            return;
        }

        setFile(file);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const parsed = parseSupersessionMappingCSV(text);
            
            if (parsed.length === 0) {
                setStatus('ERROR');
                if (onImportError) onImportError(["File is empty or invalid format"]);
            } else {
                setMappings(parsed);
                setStatus('PREVIEW');
            }
        };
        reader.readAsText(file);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const handleConfirm = async () => {
        setStatus('PROCESSING');
        
        // Simulate small delay for UX so user sees the spinner
        setTimeout(() => {
            try {
                const graph = new SupersessionGraph(mappings, itemCodes);
                
                if (graph.validationErrors.length > 0) {
                    // Decide if we block on error or allow partial. 
                    // Usually we block on cycles/critical errors.
                    // But let's allow "Success with Warnings" logic if needed.
                    // For now, let's treat validationErrors as critical enough to show in results but maybe not block completely if the graph is usable.
                    // Actually, SupersessionGraph logic handles criticals by skipping them.
                }

                setGraphResult(graph);
                setStatus('SUCCESS');
                
                // Don't auto-call success yet, let user see the report card
                // Or we can auto call:
                // onImportSuccess(graph, mappings); 
            } catch (err) {
                setStatus('ERROR');
                if (onImportError) onImportError(["Unexpected error during graph construction"]);
            }
        }, 800);
    };

    const handleFinalize = () => {
        if (graphResult) {
            onImportSuccess(graphResult, mappings);
        }
    };

    const handleReset = () => {
        setFile(null);
        setMappings([]);
        setGraphResult(null);
        setStatus('IDLE');
        if (inputRef.current) inputRef.current.value = '';
    };

    // --- RENDERERS ---

    if (status === 'IDLE') {
        return (
            <div 
                className={`
                    relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer bg-white
                    ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <input 
                    ref={inputRef}
                    type="file" 
                    className="hidden" 
                    accept=".csv" 
                    onChange={handleChange} 
                />
                
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${dragActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                    <Upload size={32} />
                </div>
                
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-1">
                    {t('ss_upload_drop')}
                </h3>
                <p className="text-xs text-slate-500 max-w-xs">
                    {t('ss_upload_desc')} (Max 5MB)
                </p>
                
                <div className="mt-6 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => inputRef.current?.click()} className="px-6 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 shadow-sm hover:text-blue-600 hover:border-blue-200 transition-all">
                        Browse File
                    </button>
                    <SampleCSVButton sampleKey="supersession" label="Tải mẫu CSV" />
                </div>
            </div>
        );
    }

    if (status === 'PREVIEW') {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                            <FileType size={20} />
                        </div>
                        <div>
                            <div className="text-sm font-black text-slate-800">{file?.name}</div>
                            <div className="text-xs text-slate-500 font-bold">{mappings.length} records found</div>
                        </div>
                    </div>
                    <button onClick={handleReset} className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Data Preview (First 5 Rows)</h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl mb-6">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 font-black text-slate-500 uppercase">
                                <tr>
                                    <th className="px-4 py-3 border-b border-slate-200">Old Part</th>
                                    <th className="px-4 py-3 border-b border-slate-200">New Part</th>
                                    <th className="px-4 py-3 border-b border-slate-200 text-center">Interchangeable</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {mappings.slice(0, 5).map((m, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 font-mono font-bold text-slate-700">{m.oldPart}</td>
                                        <td className="px-4 py-2 font-mono font-bold text-blue-600">{m.newPart}</td>
                                        <td className="px-4 py-2 text-center">
                                            {m.interchangeable ? <CheckCircle size={14} className="inline text-emerald-500"/> : <span className="text-slate-300">-</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <button onClick={handleReset} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase hover:bg-slate-50 transition-all">
                            Cancel
                        </button>
                        <button onClick={handleConfirm} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2">
                            Analyze & Import <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'PROCESSING') {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center animate-fadeIn">
                <Loader2 size={48} className="text-blue-500 animate-spin mb-6" />
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Analyzing Graph Structure...</h3>
                <p className="text-slate-500 text-sm max-w-md">
                    Validating cycles, checking inventory existence, and building supersession chains.
                </p>
            </div>
        );
    }

    if (status === 'SUCCESS' && graphResult) {
        const errorCount = graphResult.validationErrors.length;
        const warningCount = graphResult.validationWarnings.length;
        const chainCount = graphResult.chains.size;

        return (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
                <div className="bg-emerald-50 px-6 py-8 text-center border-b border-emerald-100">
                    <div className="w-16 h-16 bg-white text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border-4 border-emerald-100">
                        <CheckCircle size={32} />
                    </div>
                    <h3 className="text-xl font-black text-emerald-800 uppercase tracking-tight">Analysis Complete</h3>
                    <p className="text-emerald-600 text-sm font-bold mt-1">Ready to import {mappings.length} mappings</p>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100">
                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-center">
                        <div className="text-2xs font-black text-blue-400 uppercase tracking-widest">Active Chains</div>
                        <div className="text-2xl font-black text-blue-700 mt-1">{chainCount}</div>
                    </div>
                    <div className={`p-4 rounded-xl border text-center ${errorCount > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className={`text-2xs font-black uppercase tracking-widest ${errorCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>Critical Errors</div>
                        <div className={`text-2xl font-black mt-1 ${errorCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{errorCount}</div>
                    </div>
                    <div className={`p-4 rounded-xl border text-center ${warningCount > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className={`text-2xs font-black uppercase tracking-widest ${warningCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>Warnings</div>
                        <div className={`text-2xl font-black mt-1 ${warningCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{warningCount}</div>
                    </div>
                </div>

                {(errorCount > 0 || warningCount > 0) && (
                    <div className="p-6 bg-slate-50/50 max-h-60 overflow-y-auto custom-scrollbar">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Validation Report</h4>
                        <ul className="space-y-2">
                            {graphResult.validationErrors.map((err, i) => (
                                <li key={`e-${i}`} className="flex items-start gap-2 text-xs font-bold text-rose-600 bg-white p-2 rounded border border-rose-100">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" /> {err}
                                </li>
                            ))}
                            {graphResult.validationWarnings.map((warn, i) => (
                                <li key={`w-${i}`} className="flex items-start gap-2 text-xs font-medium text-amber-700 bg-white p-2 rounded border border-amber-100">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {warn}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="p-6 flex justify-end gap-3 bg-white">
                    <button onClick={handleReset} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase hover:bg-slate-50 transition-all">
                        Discard
                    </button>
                    <button onClick={handleFinalize} className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2">
                        <CheckCircle size={16} /> Confirm & Load Data
                    </button>
                </div>
            </div>
        );
    }

    // Default Error Fallback
    return (
        <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center animate-fadeIn">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <X size={32} />
            </div>
            <h3 className="text-lg font-black text-rose-700 uppercase mb-2">Import Failed</h3>
            <p className="text-slate-500 text-sm mb-6">Something went wrong while processing the CSV file.</p>
            <button onClick={handleReset} className="px-6 py-2 bg-white border border-slate-200 hover:border-rose-300 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wide">
                Try Again
            </button>
        </div>
    );
};
