import React from 'react';
import { FaIcon } from '../../components/Icon';
import { Typography } from '../../components/Typography';
import { AffinityReviewPanel } from '../../components/AffinityReviewPanel';

interface AffinitySuggestion {
    relatedPart: string;
    type: 'mandatory' | 'recommended';
    score: number;
    triggeredBy: string[];
    note?: string;
}

interface SubmitProgress {
    step: string;
    pct: number;
}

interface Workflow {
    id: string;
    name: string;
}

export interface SubmitApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    draftName: string;
    onDraftNameChange: (name: string) => void;
    workflows: Workflow[];
    selectedWorkflowId: string;
    onWorkflowChange: (id: string) => void;
    affinitySuggestions: {
        mandatoryMissing: AffinitySuggestion[];
        recommended: AffinitySuggestion[];
    };
    affinityItemNames: Record<string, string>;
    onAddAffinity: (sku: string) => void;
    isSubmitting: boolean;
    submitProgress: SubmitProgress | null;
    onSubmit: () => void;
}

export function SubmitApprovalModal({
    isOpen,
    onClose,
    draftName,
    onDraftNameChange,
    workflows,
    selectedWorkflowId,
    onWorkflowChange,
    affinitySuggestions,
    affinityItemNames,
    onAddAffinity,
    isSubmitting,
    submitProgress,
    onSubmit,
}: SubmitApprovalModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-[scaleIn_0.2s_ease-out]">
                {/* Premium Header */}
                <div className="bg-gradient-professional px-6 py-5 border-b border-white/10 flex justify-between items-center z-10">
                    <div className="flex items-center gap-3 text-white">
                        <FaIcon className="fas fa-paper-plane text-xl text-emerald-300" />
                        <Typography variant="h2" className="text-white !text-xl m-0">
                            Gửi Phê duyệt
                        </Typography>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-rose-500 transition-colors"
                    >
                        <FaIcon className="fas fa-times" />
                    </button>
                </div>

                <div className="p-6 space-y-5 bg-slate-50/50">
                    <div className="space-y-4">
                        <div>
                            <label
                                htmlFor="submit-draft-name"
                                className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1"
                            >
                                Tên Draft
                            </label>
                            <input
                                id="submit-draft-name"
                                name="draftName"
                                value={draftName}
                                onChange={e => onDraftNameChange(e.target.value)}
                                placeholder="VD: KIA_NB_Tháng4_2026"
                                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 text-slate-800 transition-all bg-white"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="submit-workflow"
                                className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1"
                            >
                                Workflow Phê duyệt
                            </label>
                            {workflows.length === 0 ? (
                                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 font-bold">
                                    Chưa có workflow nào. Vui lòng tạo trong Settings.
                                </p>
                            ) : (
                                <select
                                    id="submit-workflow"
                                    name="workflowId"
                                    value={selectedWorkflowId}
                                    onChange={e => onWorkflowChange(e.target.value)}
                                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 text-slate-800 bg-white transition-all appearance-none cursor-pointer"
                                >
                                    {workflows.map(wf => (
                                        <option key={wf.id} value={wf.id}>
                                            {wf.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Part Affinity suggestions trước khi gửi */}
                    {(affinitySuggestions.mandatoryMissing.length > 0 ||
                        affinitySuggestions.recommended.length > 0) && (
                        <AffinityReviewPanel
                            mandatoryMissing={affinitySuggestions.mandatoryMissing}
                            recommended={affinitySuggestions.recommended}
                            itemNames={affinityItemNames}
                            onAdd={onAddAffinity}
                        />
                    )}

                    <div className="pt-2 space-y-3">
                        {/* Progress bar — shown during submission */}
                        {isSubmitting && submitProgress && (
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                    <span>{submitProgress.step}</span>
                                    <span>{submitProgress.pct}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                        style={{ width: `${submitProgress.pct}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        <button
                            onClick={onSubmit}
                            disabled={isSubmitting || !draftName.trim() || !selectedWorkflowId}
                            className="lg-btn lg-btn-primary lg-btn-lg lg-btn-full disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <FaIcon className="fas fa-circle-notch fa-spin" />{' '}
                                    {submitProgress?.step || 'Đang xử lý...'}
                                </>
                            ) : (
                                <>
                                    <FaIcon className="fas fa-paper-plane" /> Xác nhận gửi
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
