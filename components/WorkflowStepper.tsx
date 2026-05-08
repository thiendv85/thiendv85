import React from 'react';
import { ApprovalRequest, ApprovalAction, ApprovalWorkflow } from '../types/inventory';

interface Props {
    request: ApprovalRequest;
    workflow: ApprovalWorkflow | null;
    actions: ApprovalAction[];
    usersMap: Record<string, string>;
    className?: string;
    compact?: boolean;
}

type StepStatus = 'completed' | 'current' | 'future' | 'rejected' | 'returned';

interface Step {
    label: string;
    sublabel: string;
    primaryName: string;
    extraCount: number;
    extraNames: string[];
    date: string;
    note: string;
    status: StepStatus;
    icon: string;
}

const shortName = (name: string) => {
    if (!name) return '—';
    const trimmed = name.split('@')[0].trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(p => p[0]?.toUpperCase()).join('. ');
    return `${initials}. ${last}`;
};

const initials = (name: string) => {
    if (!name) return '?';
    const trimmed = name.split('@')[0].trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const WorkflowStepper = ({ request, workflow, actions, usersMap, className = '', compact = false }: Props) => {
    if (!workflow) return null;

    const proposerName = usersMap[request.submitted_by] || 'N/A';
    const submissionDt = new Date(request.submitted_at);
    const submissionDate = `${submissionDt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${submissionDt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;

    // Latest action per level
    const levelActions = actions.reduce((acc, action) => {
        if (!acc[action.level] || new Date(action.acted_at) > new Date(acc[action.level].acted_at)) {
            acc[action.level] = action;
        }
        return acc;
    }, {} as Record<number, ApprovalAction>);

    const steps: Step[] = [
        {
            label: 'Đề xuất',
            sublabel: 'Người đề xuất',
            primaryName: proposerName,
            extraCount: 0,
            extraNames: [],
            date: submissionDate,
            note: '',
            status: 'completed',
            icon: 'fa-paper-plane',
        },
        ...workflow.levels.map<Step>(lvl => {
            const action = levelActions[lvl.level];
            const isCurrent = request.current_level === lvl.level && ['pending', 'in_progress'].includes(request.status);
            const isCompleted = action?.action === 'approved' || (lvl.level < request.current_level && request.status !== 'rejected');
            const isRejected = action?.action === 'rejected' || (request.current_level === lvl.level && request.status === 'rejected');
            const isReturned = action?.action === 'returned' || (request.current_level === lvl.level && request.status === 'returned');

            let status: StepStatus = 'future';
            if (isRejected) status = 'rejected';
            else if (isReturned) status = 'returned';
            else if (isCompleted) status = 'completed';
            else if (isCurrent) status = 'current';

            // Resolve approver names regardless of status — user wants visibility
            const approverNames = (lvl.approver_ids || []).map(id => usersMap[id] || id);
            let primaryName: string;
            let extraNames: string[] = [];
            let extraCount = 0;
            let sublabel: string;

            if (action) {
                primaryName = usersMap[action.actor_id] || 'N/A';
                sublabel =
                    status === 'completed' ? 'Đã duyệt'
                    : status === 'rejected' ? 'Đã từ chối'
                    : status === 'returned' ? 'Đã trả lại'
                    : 'Đã hành động';
                // Show other approvers in the pool besides the actor
                extraNames = approverNames.filter(n => n !== primaryName);
                extraCount = extraNames.length;
            } else if (approverNames.length > 0) {
                primaryName = approverNames[0];
                extraNames = approverNames.slice(1);
                extraCount = extraNames.length;
                sublabel = isCurrent
                    ? (lvl.require_all ? 'Cần TẤT CẢ duyệt' : 'Đang chờ')
                    : (lvl.require_all ? 'Cần tất cả' : 'Approver');
            } else {
                primaryName = 'Chưa gán';
                sublabel = 'Approver';
            }

            return {
                label: `Level ${lvl.level}`,
                sublabel,
                primaryName,
                extraCount,
                extraNames,
                date: action
                    ? `${new Date(action.acted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${new Date(action.acted_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`
                    : '',
                note: action?.comment || '',
                status,
                icon:
                    status === 'completed' ? 'fa-check'
                    : status === 'rejected' ? 'fa-xmark'
                    : status === 'returned' ? 'fa-rotate-left'
                    : status === 'current' ? 'fa-user-pen'
                    : 'fa-user',
            };
        }),
    ];

    const statusToken = (s: StepStatus) => {
        switch (s) {
            case 'completed':
                return { circle: 'bg-emerald-500 border-emerald-400 text-white shadow-emerald-200/60', avatar: 'bg-emerald-50 text-emerald-700 border-emerald-200', accent: 'text-emerald-700' };
            case 'current':
                return { circle: 'bg-blue-600 border-blue-400 text-white shadow-blue-300/60 animate-pulse', avatar: 'bg-blue-50 text-blue-700 border-blue-300', accent: 'text-blue-700' };
            case 'rejected':
                return { circle: 'bg-rose-500 border-rose-400 text-white shadow-rose-200/60', avatar: 'bg-rose-50 text-rose-700 border-rose-200', accent: 'text-rose-700' };
            case 'returned':
                return { circle: 'bg-indigo-500 border-indigo-400 text-white shadow-indigo-200/60', avatar: 'bg-indigo-50 text-indigo-700 border-indigo-200', accent: 'text-indigo-700' };
            default:
                return { circle: 'bg-white border-slate-200 text-slate-300', avatar: 'bg-slate-50 text-slate-400 border-slate-200', accent: 'text-slate-400' };
        }
    };

    if (compact) {
        return (
            <div className={`flex items-stretch w-full gap-0 ${className}`}>
                {steps.map((step, idx) => {
                    const tk = statusToken(step.status);
                    const prev = idx > 0 ? steps[idx - 1] : null;
                    const connectorActive = prev && (prev.status === 'completed' || prev.status === 'rejected' || prev.status === 'returned');
                    return (
                        <React.Fragment key={idx}>
                            {idx > 0 && (
                                <div className="flex items-center min-w-[16px] flex-1 px-1 pt-3">
                                    <div className={`h-[2px] w-full rounded-full ${connectorActive ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                                </div>
                            )}
                            <div className="flex flex-col items-center min-w-[88px] max-w-[140px] flex-1 group" title={step.note ? `"${step.note}"` : undefined}>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all shadow-md ${tk.circle}`}>
                                        <i className={`fas ${step.icon} text-[10px]`} />
                                    </div>
                                </div>
                                <div className="mt-1.5 flex flex-col items-center text-center">
                                    <span className={`text-[9px] font-black uppercase tracking-[0.18em] ${step.status === 'future' ? 'text-slate-400' : 'text-slate-700'}`}>
                                        {step.label}
                                    </span>
                                    <span className={`text-[11px] font-black mt-0.5 leading-tight max-w-[120px] truncate ${tk.accent}`} title={step.primaryName}>
                                        {shortName(step.primaryName)}
                                    </span>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                            {step.sublabel}
                                        </span>
                                        {step.extraCount > 0 && (
                                            <span
                                                className="text-[9px] font-black bg-slate-100 text-slate-600 px-1.5 py-px rounded-full border border-slate-200"
                                                title={step.extraNames.join(', ')}
                                            >
                                                +{step.extraCount}
                                            </span>
                                        )}
                                    </div>
                                    {step.date && (
                                        <span className="text-[9px] text-slate-400 font-bold mt-0.5 tabular-nums">{step.date}</span>
                                    )}
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        );
    }

    // ── Full size ────────────────────────────────────────────────────────────
    return (
        <div className={`flex items-stretch w-full gap-0 px-2 py-4 ${className}`}>
            {steps.map((step, idx) => {
                const tk = statusToken(step.status);
                const prev = idx > 0 ? steps[idx - 1] : null;
                const connectorActive = prev && (prev.status === 'completed' || prev.status === 'rejected' || prev.status === 'returned');
                return (
                    <React.Fragment key={idx}>
                        {idx > 0 && (
                            <div className="flex items-center min-w-[24px] flex-1 px-1 pt-4">
                                <div className={`h-[2px] w-full rounded-full ${connectorActive ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                            </div>
                        )}
                        <div className="flex flex-col items-center min-w-[140px] max-w-[180px] flex-1">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${tk.circle}`}>
                                <i className={`fas ${step.icon} text-xs`} />
                            </div>
                            <div className="mt-2 flex flex-col items-center text-center">
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${step.status === 'future' ? 'text-slate-400' : 'text-slate-700'}`}>
                                    {step.label}
                                </span>
                                <div className={`mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${tk.avatar}`}>
                                    <div className="w-5 h-5 rounded-full bg-white/70 text-[9px] font-black flex items-center justify-center border border-current/20">
                                        {initials(step.primaryName)}
                                    </div>
                                    <span className="text-[11px] font-black leading-tight max-w-[120px] truncate" title={step.primaryName}>
                                        {shortName(step.primaryName)}
                                    </span>
                                    {step.extraCount > 0 && (
                                        <span
                                            className="text-[9px] font-black bg-white/80 text-slate-600 px-1.5 py-px rounded-full border border-current/20"
                                            title={step.extraNames.join(', ')}
                                        >
                                            +{step.extraCount}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                                    {step.sublabel}
                                </span>
                                {step.date && (
                                    <span className="text-[10px] text-slate-400 font-black mt-0.5 tabular-nums">{step.date}</span>
                                )}
                            </div>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};
