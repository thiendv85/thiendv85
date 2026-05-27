import React, { useState, useEffect, useCallback } from 'react';
import {
    listProfiles,
    updateProfileRole,
    toggleUserActive,
    listWorkflows,
    createWorkflow,
    updateWorkflow,
    createUserByAdmin,
    adminResetPassword,
} from '../../utils/supabase';
import { supabase } from '../../utils/supabase';
import { Typography } from '../../components/Typography';
import { FaIcon } from '../../components/Icon';
import { AVAILABLE_BRANDS, ApprovalWorkflow, WorkflowLevel } from '../../types/inventory';
import { useAuth } from '../../utils/authContext';
import { UserProfile, UserRole } from '../../utils/authContext';
import { SectionCard } from './SettingsUI';

const ROLE_LABELS: Record<UserRole, string> = {
    admin: 'Admin',
    planner: 'Planner',
    approver: 'Approver',
    viewer: 'Viewer',
};

export const UserManagementTab = () => {
    const { user, profile } = useAuth();
    const isAdmin = profile?.role === 'admin';
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [workflows, setWorkflowList] = useState<ApprovalWorkflow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newWfName, setNewWfName] = useState('');
    const [newWfBrand, setNewWfBrand] = useState<string>('');
    const [newWfProposers, setNewWfProposers] = useState<string[]>([]);
    const [newWfLevels, setNewWfLevels] = useState<WorkflowLevel[]>([
        { level: 1, approver_ids: [], require_all: false },
    ]);
    const [showNewWfForm, setShowNewWfForm] = useState(false);
    const [editingWf, setEditingWf] = useState<ApprovalWorkflow | null>(null);

    // Create user form
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newFullName, setNewFullName] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('viewer');
    const [createError, setCreateError] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Change password (own)
    const [showChangePw, setShowChangePw] = useState(false);
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwMsg, setPwMsg] = useState('');
    const [isChangingPw, setIsChangingPw] = useState(false);

    // Admin reset password for another user
    const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
    const [resetPw, setResetPw] = useState('');
    const [resetMsg, setResetMsg] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        const [u, w] = await Promise.all([listProfiles(), listWorkflows()]);
        setUsers(u);
        setWorkflowList(w);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleRoleChange = async (userId: string, role: UserRole) => {
        await updateProfileRole(userId, role);
        setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role } : u)));
    };

    const handleBrandChange = async (userId: string, brand: string | null) => {
        await supabase.from('profiles').update({ department: brand }).eq('id', userId);
        setUsers(prev => prev.map(u => (u.id === userId ? { ...u, department: brand } : u)));
    };

    const handleToggleActive = async (userId: string, active: boolean) => {
        await toggleUserActive(userId, !active);
        setUsers(prev => prev.map(u => (u.id === userId ? { ...u, is_active: !active } : u)));
    };

    const handleCreateUser = async () => {
        if (!newEmail.trim() || !newPassword.trim()) return;
        setIsCreating(true);
        setCreateError('');
        const { error } = await createUserByAdmin(newEmail.trim(), newPassword, newFullName.trim(), newRole);
        setIsCreating(false);
        if (error) {
            setCreateError(error);
            return;
        }
        setNewEmail('');
        setNewPassword('');
        setNewFullName('');
        setNewRole('viewer');
        setShowCreateUser(false);
        load();
    };

    const handleChangePassword = async () => {
        if (newPw.length < 6) {
            setPwMsg('Mật khẩu phải ít nhất 6 ký tự.');
            return;
        }
        if (newPw !== confirmPw) {
            setPwMsg('Mật khẩu không khớp.');
            return;
        }
        setIsChangingPw(true);
        const { error } = await supabase.auth.updateUser({ password: newPw });
        setIsChangingPw(false);
        if (error) {
            setPwMsg(error.message);
            return;
        }
        setPwMsg('✓ Đã đổi mật khẩu thành công!');
        setNewPw('');
        setConfirmPw('');
        setTimeout(() => {
            setPwMsg('');
            setShowChangePw(false);
        }, 2000);
    };

    const handleOpenEditWf = (wf: ApprovalWorkflow) => {
        setEditingWf(wf);
        setNewWfName(wf.name);
        setNewWfBrand(wf.brand || '');
        setNewWfProposers(wf.proposer_ids ?? []);
        setNewWfLevels(wf.levels.length > 0 ? wf.levels : [{ level: 1, approver_ids: [], require_all: false }]);
        setShowNewWfForm(true);
    };

    const handleSaveWf = async () => {
        if (!newWfName.trim() || !user) return;
        if (editingWf) {
            await updateWorkflow(editingWf.id, {
                name: newWfName.trim(),
                brand: newWfBrand || null,
                levels: newWfLevels,
                proposer_ids: newWfProposers,
            });
        } else {
            await createWorkflow({
                name: newWfName.trim(),
                brand: newWfBrand || null,
                levels: newWfLevels,
                proposer_ids: newWfProposers,
                is_active: true,
                created_by: user.id,
            });
        }
        setEditingWf(null);
        setNewWfName('');
        setNewWfBrand('');
        setNewWfProposers([]);
        setNewWfLevels([{ level: 1, approver_ids: [], require_all: false }]);
        setShowNewWfForm(false);
        load();
    };

    const handleAdminResetPassword = async () => {
        if (!resetTarget || resetPw.length < 6) {
            setResetMsg('Mật khẩu phải ít nhất 6 ký tự.');
            return;
        }
        setIsResetting(true);
        setResetMsg('');
        const { error } = await adminResetPassword(resetTarget.id, resetPw);
        setIsResetting(false);
        if (error) {
            setResetMsg(error);
            return;
        }
        setResetMsg('✓ Đã đổi mật khẩu!');
        setTimeout(() => {
            setResetTarget(null);
            setResetPw('');
            setResetMsg('');
        }, 1500);
    };

    const handleToggleWorkflow = async (wf: ApprovalWorkflow) => {
        await updateWorkflow(wf.id, { is_active: !wf.is_active });
        load();
    };

    if (isLoading)
        return (
            <div className="flex items-center justify-center py-16 text-slate-400">
                <FaIcon className="fas fa-circle-notch fa-spin text-2xl" />
            </div>
        );

    return (
        <div className="space-y-6 animate-fadeIn pb-24">
            {/* Users Table */}
            <SectionCard title="Danh sách người dùng" icon="fa-users">
                <div className="overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest border-b border-slate-200">
                                <th className="px-4 py-3 text-left font-black">Họ tên</th>
                                <th className="px-4 py-3 text-left font-black">Email</th>
                                <th className="px-4 py-3 text-left font-black">Role</th>
                                <th className="px-4 py-3 text-left font-black">Brand</th>
                                <th className="px-4 py-3 text-center font-black">Trạng thái</th>
                                <th className="px-4 py-3 text-right font-black">Hành động</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-3 font-bold text-slate-800">
                                        {u.full_name || <span className="text-slate-400 italic">Chưa đặt tên</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {u.email || <span className="text-slate-400 italic">Không có</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={u.role}
                                            onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                                            className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold bg-white outline-none focus:border-blue-400"
                                        >
                                            {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                                                <option key={r} value={r}>
                                                    {ROLE_LABELS[r]}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={u.department || ''}
                                            onChange={e => handleBrandChange(u.id, e.target.value || null)}
                                            className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold bg-white outline-none focus:border-blue-400"
                                        >
                                            <option value="">Tất cả</option>
                                            {AVAILABLE_BRANDS.map(b => (
                                                <option key={b} value={b}>
                                                    {b}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span
                                            className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${u.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                                        >
                                            <FaIcon
                                                className={`fas ${u.is_active ? 'fa-circle-check' : 'fa-circle-xmark'} text-[8px]`}
                                            />
                                            {u.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => {
                                                    setResetTarget(u);
                                                    setResetPw('');
                                                    setResetMsg('');
                                                }}
                                                className="text-xs font-black px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all"
                                            >
                                                <FaIcon className="fas fa-key mr-1" />
                                                Đổi mật khẩu
                                            </button>
                                            <button
                                                onClick={() => handleToggleActive(u.id, u.is_active)}
                                                className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all ${u.is_active ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                            >
                                                {u.is_active ? 'Vô hiệu hoá' : 'Kích hoạt'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Admin Reset Password Modal */}
                {resetTarget && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                        onClick={() => setResetTarget(null)}
                    >
                        <div
                            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <FaIcon className="fas fa-key text-blue-600" />
                                </div>
                                <div>
                                    <p className="font-black text-slate-800 text-sm">Đổi mật khẩu</p>
                                    <p className="text-xs text-slate-500">{resetTarget.full_name || 'Người dùng'}</p>
                                </div>
                            </div>
                            {resetMsg && (
                                <p
                                    className={`text-xs px-3 py-2 rounded-lg border ${resetMsg.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-600'}`}
                                >
                                    {resetMsg}
                                </p>
                            )}
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Mật khẩu mới</label>
                                <input
                                    type="password"
                                    value={resetPw}
                                    onChange={e => setResetPw(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAdminResetPassword()}
                                    placeholder="Ít nhất 6 ký tự"
                                    autoFocus
                                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400 font-medium"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAdminResetPassword}
                                    disabled={isResetting || resetPw.length < 6}
                                    className="flex-1 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-40 lg-btn lg-btn-blue lg-btn-lg"
                                >
                                    {isResetting ? (
                                        <>
                                            <FaIcon className="fas fa-circle-notch fa-spin" /> Đang lưu...
                                        </>
                                    ) : (
                                        <>
                                            <FaIcon className="fas fa-check" /> Xác nhận
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setResetTarget(null)}
                                    className="px-4 py-2.5 rounded-xl text-sm font-black border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
                                >
                                    Hủy
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Create User Form */}
                {showCreateUser ? (
                    <div className="mt-4 p-4 border border-blue-200 bg-blue-50 rounded-xl space-y-3">
                        <Typography
                            variant="label"
                            className="text-blue-700 font-black uppercase tracking-widest block"
                        >
                            Tạo tài khoản mới
                        </Typography>
                        {createError && (
                            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                                {createError}
                            </p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Họ tên</label>
                                <input
                                    value={newFullName}
                                    onChange={e => setNewFullName(e.target.value)}
                                    placeholder="Nguyễn Văn A"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Role</label>
                                <select
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value as UserRole)}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-blue-400"
                                >
                                    {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                                        <option key={r} value={r}>
                                            {ROLE_LABELS[r]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    placeholder="user@company.com"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Mật khẩu</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Ít nhất 6 ký tự"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCreateUser}
                                disabled={isCreating || !newEmail || !newPassword}
                                className="px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-40 lg-btn lg-btn-sm lg-btn-blue"
                            >
                                {isCreating ? (
                                    <>
                                        <FaIcon className="fas fa-circle-notch fa-spin" /> Đang tạo...
                                    </>
                                ) : (
                                    <>
                                        <FaIcon className="fas fa-user-plus" /> Tạo tài khoản
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateUser(false);
                                    setCreateError('');
                                }}
                                className="px-4 py-2 rounded-lg text-xs font-black border border-slate-200 text-slate-500 hover:bg-slate-50"
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowCreateUser(true)}
                        className="mt-3 flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-black"
                    >
                        <FaIcon className="fas fa-user-plus" /> Tạo tài khoản mới
                    </button>
                )}
            </SectionCard>

            {/* Workflows */}
            <SectionCard title="Cấu hình Workflow Phê duyệt" icon="fa-sitemap">
                <div className="space-y-2">
                    {workflows.map(wf => {
                        const getName = (id: string) => users.find(u => u.id === id)?.full_name || id.slice(0, 8);
                        return (
                            <div key={wf.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-slate-800 text-sm">{wf.name}</span>
                                        {wf.brand && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                                {wf.brand}
                                            </span>
                                        )}
                                        <span className="text-xs text-slate-400">{wf.levels.length} cấp phê duyệt</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleOpenEditWf(wf)}
                                            className="text-xs font-black px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-all"
                                        >
                                            <FaIcon className="fas fa-pen mr-1" />
                                            Sửa
                                        </button>
                                        <button
                                            onClick={() => handleToggleWorkflow(wf)}
                                            className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all ${wf.is_active ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                        >
                                            {wf.is_active ? 'Tắt' : 'Bật'}
                                        </button>
                                    </div>
                                </div>
                                {/* Detail rows */}
                                <div className="divide-y divide-slate-100 px-4 py-2 space-y-1">
                                    {/* Proposers */}
                                    <div className="flex items-start gap-3 py-1.5">
                                        <span className="text-xs font-black text-violet-600 w-36 shrink-0 flex items-center gap-1">
                                            <FaIcon className="fas fa-user-pen" /> Người đề xuất
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                            {(wf.proposer_ids ?? []).length === 0 ? (
                                                <span className="text-xs text-slate-400 italic">Tất cả planner</span>
                                            ) : (
                                                (wf.proposer_ids ?? []).map(id => (
                                                    <span
                                                        key={id}
                                                        className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-bold"
                                                    >
                                                        {getName(id)}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                    {/* Each level */}
                                    {wf.levels.map(lvl => (
                                        <div key={lvl.level} className="flex items-start gap-3 py-1.5">
                                            <span className="text-xs font-black text-blue-600 w-36 shrink-0 flex items-center gap-1">
                                                <FaIcon className="fas fa-check-circle" /> Cấp {lvl.level}{' '}
                                                {lvl.require_all && (
                                                    <span className="text-[10px] text-slate-400">(tất cả)</span>
                                                )}
                                            </span>
                                            <div className="flex flex-wrap gap-1">
                                                {lvl.approver_ids.length === 0 ? (
                                                    <span className="text-xs text-slate-400 italic">
                                                        Chưa chọn người duyệt
                                                    </span>
                                                ) : (
                                                    lvl.approver_ids.map(id => (
                                                        <span
                                                            key={id}
                                                            className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold"
                                                        >
                                                            {getName(id)}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {workflows.length === 0 && (
                        <p className="text-sm text-slate-400 py-4 text-center">Chưa có workflow nào.</p>
                    )}
                </div>
                {showNewWfForm ? (
                    <div className="mt-4 border border-blue-200 bg-blue-50/50 rounded-2xl p-4 space-y-4">
                        <p className="text-xs font-black text-blue-700 uppercase tracking-widest">
                            {editingWf ? `Chỉnh sửa: ${editingWf.name}` : 'Tạo workflow mới'}
                        </p>

                        {/* Name + Brand */}
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="block text-xs font-black text-slate-500 mb-1">Tên workflow</label>
                                <input
                                    value={newWfName}
                                    onChange={e => setNewWfName(e.target.value)}
                                    placeholder="VD: Phê duyệt đặt hàng BMW"
                                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-500 mb-1">Thương hiệu</label>
                                <select
                                    value={newWfBrand}
                                    onChange={e => setNewWfBrand(e.target.value)}
                                    className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400 bg-white"
                                >
                                    <option value="">Tất cả</option>
                                    {AVAILABLE_BRANDS.map(b => (
                                        <option key={b} value={b}>
                                            {b}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Proposers */}
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-2">NGƯỜI ĐỀ XUẤT</label>
                            <div className="flex flex-wrap gap-2">
                                {users
                                    .filter(u => u.role === 'planner' || u.role === 'admin')
                                    .map(u => (
                                        <label
                                            key={u.id}
                                            className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${newWfProposers.includes(u.id) ? 'bg-violet-100 border-violet-300 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-violet-200'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={newWfProposers.includes(u.id)}
                                                onChange={e =>
                                                    setNewWfProposers(prev =>
                                                        e.target.checked
                                                            ? [...prev, u.id]
                                                            : prev.filter(id => id !== u.id),
                                                    )
                                                }
                                                className="sr-only"
                                            />
                                            <FaIcon className="fas fa-user text-[10px]" />{' '}
                                            {u.full_name || u.id.slice(0, 8)}
                                        </label>
                                    ))}
                                {users.filter(u => u.role === 'planner' || u.role === 'admin').length === 0 && (
                                    <span className="text-xs text-slate-400 italic">
                                        Chưa có người dùng role planner/admin
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Levels builder */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-black text-slate-500">CẤP PHÊ DUYỆT</label>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setNewWfLevels(prev => [
                                            ...prev,
                                            { level: prev.length + 1, approver_ids: [], require_all: false },
                                        ])
                                    }
                                    className="text-xs font-black text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                    <FaIcon className="fas fa-plus" /> Thêm cấp
                                </button>
                            </div>
                            <div className="space-y-3">
                                {newWfLevels.map((lvl, idx) => (
                                    <div
                                        key={idx}
                                        className="bg-white border border-slate-200 rounded-xl p-3 space-y-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-slate-600">Cấp {lvl.level}</span>
                                            <div className="flex items-center gap-3">
                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={lvl.require_all}
                                                        onChange={e =>
                                                            setNewWfLevels(prev =>
                                                                prev.map((l, i) =>
                                                                    i === idx
                                                                        ? { ...l, require_all: e.target.checked }
                                                                        : l,
                                                                ),
                                                            )
                                                        }
                                                        className="w-3.5 h-3.5 rounded accent-blue-600"
                                                    />
                                                    <span className="text-xs text-slate-500 font-bold">
                                                        Yêu cầu tất cả duyệt
                                                    </span>
                                                </label>
                                                {newWfLevels.length > 1 && isAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setNewWfLevels(prev =>
                                                                prev
                                                                    .filter((_, i) => i !== idx)
                                                                    .map((l, i) => ({ ...l, level: i + 1 })),
                                                            )
                                                        }
                                                        className="text-rose-400 hover:text-rose-600 text-xs"
                                                    >
                                                        <FaIcon className="fas fa-trash" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {/* Approver checkboxes */}
                                        <div className="flex flex-wrap gap-2">
                                            {users
                                                .filter(u => u.role === 'approver' || u.role === 'admin')
                                                .map(u => (
                                                    <label
                                                        key={u.id}
                                                        className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${lvl.approver_ids.includes(u.id) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200'}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={lvl.approver_ids.includes(u.id)}
                                                            onChange={e =>
                                                                setNewWfLevels(prev =>
                                                                    prev.map((l, i) =>
                                                                        i === idx
                                                                            ? {
                                                                                  ...l,
                                                                                  approver_ids: e.target.checked
                                                                                      ? [...l.approver_ids, u.id]
                                                                                      : l.approver_ids.filter(
                                                                                            id => id !== u.id,
                                                                                        ),
                                                                              }
                                                                            : l,
                                                                    ),
                                                                )
                                                            }
                                                            className="sr-only"
                                                        />
                                                        {u.full_name || u.id.slice(0, 8)}
                                                    </label>
                                                ))}
                                            {users.filter(u => u.role === 'approver' || u.role === 'admin').length ===
                                                0 && (
                                                <span className="text-xs text-slate-400 italic">
                                                    Chưa có người dùng role approver/admin
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={handleSaveWf}
                                disabled={!newWfName.trim()}
                                className="px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-40 lg-btn lg-btn-blue"
                            >
                                <FaIcon className="fas fa-check" /> {editingWf ? 'Lưu thay đổi' : 'Tạo workflow'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowNewWfForm(false);
                                    setEditingWf(null);
                                    setNewWfName('');
                                    setNewWfBrand('');
                                    setNewWfProposers([]);
                                    setNewWfLevels([{ level: 1, approver_ids: [], require_all: false }]);
                                }}
                                className="px-4 py-2 rounded-xl text-sm font-black border border-slate-200 text-slate-500 hover:bg-slate-50"
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowNewWfForm(true)}
                        className="mt-3 flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-black"
                    >
                        <FaIcon className="fas fa-plus" /> Thêm workflow mới
                    </button>
                )}
            </SectionCard>

            {/* Change Password */}
            <SectionCard title="Đổi mật khẩu" icon="fa-lock">
                {!showChangePw ? (
                    <button
                        onClick={() => setShowChangePw(true)}
                        className="flex items-center gap-2 text-slate-600 hover:text-blue-600 text-sm font-black border border-slate-200 px-4 py-2 rounded-xl hover:border-blue-300 transition-all"
                    >
                        <FaIcon className="fas fa-key" /> Đổi mật khẩu của tôi
                    </button>
                ) : (
                    <div className="space-y-3 max-w-sm">
                        {pwMsg && (
                            <p
                                className={`text-xs px-3 py-2 rounded-lg border ${pwMsg.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-600'}`}
                            >
                                {pwMsg}
                            </p>
                        )}
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-1">Mật khẩu mới</label>
                            <input
                                type="password"
                                value={newPw}
                                onChange={e => setNewPw(e.target.value)}
                                placeholder="Ít nhất 6 ký tự"
                                className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-slate-500 mb-1">Xác nhận mật khẩu</label>
                            <input
                                type="password"
                                value={confirmPw}
                                onChange={e => setConfirmPw(e.target.value)}
                                placeholder="Nhập lại mật khẩu mới"
                                className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-400"
                                onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleChangePassword}
                                disabled={isChangingPw || !newPw || !confirmPw}
                                className="px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-40 lg-btn lg-btn-sm lg-btn-blue"
                            >
                                {isChangingPw ? (
                                    <>
                                        <FaIcon className="fas fa-circle-notch fa-spin" /> Đang lưu...
                                    </>
                                ) : (
                                    <>
                                        <FaIcon className="fas fa-check" /> Xác nhận
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setShowChangePw(false);
                                    setNewPw('');
                                    setConfirmPw('');
                                    setPwMsg('');
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-black border border-slate-200 text-slate-500 hover:bg-slate-50"
                            >
                                Hủy
                            </button>
                        </div>
                    </div>
                )}
            </SectionCard>
        </div>
    );
};
