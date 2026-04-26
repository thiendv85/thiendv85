import React from 'react';
import { ApprovalRequest, ApprovalAction, ApprovalWorkflow } from '../types/inventory';

interface Props {
    request: ApprovalRequest;
    workflow: ApprovalWorkflow | null;
    actions: ApprovalAction[];
    usersMap: Record<string, string>;
    className?: string;
}

export const WorkflowStepper = ({ request, workflow, actions, usersMap, className = '' }: Props) => {
    if (!workflow) return null;

    // Proposer is step 0
    const proposerName = usersMap[request.submitted_by] || 'N/A';
    const submissionDate = new Date(request.submitted_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

    // Group actions by level for easy lookup
    const levelActions = (actions || []).reduce((acc, action) => {
        if (!acc[action.level] || new Date(action.acted_at) > new Date(acc[action.level].acted_at)) {
            acc[action.level] = action;
        }
        return acc;
    }, {} as Record<number, ApprovalAction>);

    const steps = [
        {
            label: 'Đề xuất',
            actor: proposerName,
            date: submissionDate,
            status: 'completed',
            icon: 'fa-paper-plane'
        },
        ...workflow.levels.map(lvl => {
            const action = levelActions[lvl.level];
            const isCurrent = request.current_level === lvl.level && ['pending', 'in_progress'].includes(request.status);
            const isCompleted = action?.action === 'approved' || (lvl.level < request.current_level && request.status !== 'rejected');
            const isRejected = action?.action === 'rejected' || (request.current_level === lvl.level && request.status === 'rejected');
            const isReturned = action?.action === 'returned' || (request.current_level === lvl.level && request.status === 'returned');

            let status: 'completed' | 'current' | 'future' | 'rejected' | 'returned' = 'future';
            if (isRejected) status = 'rejected';
            else if (isReturned) status = 'returned';
            else if (isCompleted) status = 'completed';
            else if (isCurrent) status = 'current';

            return {
                label: `Level ${lvl.level}`,
                actor: action ? (usersMap[action.actor_id] || 'N/A') : ((lvl.approver_ids?.length || 0) > 1 ? `${lvl.approver_ids.length} Approvers` : 'Pending'),
                date: action ? new Date(action.acted_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '',
                status,
                icon: status === 'completed' ? 'fa-check' : (status === 'rejected' ? 'fa-xmark' : (status === 'returned' ? 'fa-rotate-left' : 'fa-user-pen'))
            };
        })
    ];

    return (
        <div className={`flex items-start w-full px-4 py-6 ${className}`}>
            {steps.map((step, idx) => (
                <React.Fragment key={idx}>
                    {/* Step Circle & Column */}
                    <div className="flex flex-col items-center relative group min-w-[100px]">
                        {/* Circle */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 ${
                            step.status === 'completed' ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-200 text-white' :
                            step.status === 'current' ? 'bg-blue-600 border-blue-400 shadow-lg shadow-blue-200 text-white animate-pulse' :
                            step.status === 'rejected' ? 'bg-rose-500 border-rose-400 text-white' :
                            step.status === 'returned' ? 'bg-indigo-500 border-indigo-400 text-white' :
                            'bg-slate-50 border-slate-200 text-slate-300'
                        }`}>
                            <i className={`fas ${step.icon} text-[10px]`} />
                        </div>

                        {/* Label */}
                        <div className="mt-2 flex flex-col items-center">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${
                                step.status === 'future' ? 'text-slate-400' : 'text-slate-700'
                            }`}>{step.label}</span>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5 truncate max-w-[120px] text-center">
                                {step.status === 'completed' || step.status === 'rejected' || step.status === 'returned' ? step.actor : (step.status === 'current' ? 'Waiting' : '')}
                            </span>
                            {step.date && <span className="text-[8px] text-slate-300 font-bold">{step.date}</span>}
                        </div>
                    </div>

                    {/* Connector Line */}
                    {idx < steps.length - 1 && (
                        <div className="flex-1 mt-4 mx-[-10px] min-w-[30px]">
                            <div className={`h-[2px] w-full transition-all duration-700 ${
                                step.status === 'completed' ? 'bg-emerald-400' : 'bg-slate-100'
                            }`} />
                        </div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};
