import { supabase } from './client';
import type { UserRole, UserProfile } from '../authContext';
import { selectAllPaginated } from './helpers';
import { profileRowSchema } from '../validation';

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error || !data) return null;
    const parsed = profileRowSchema.safeParse(data);
    if (!parsed.success) return null;
    return data as UserProfile;
}

export async function listProfiles(): Promise<(UserProfile & { email?: string })[]> {
    return selectAllPaginated<UserProfile & { email?: string }>(
        (from, to) =>
            supabase.from('profiles').select('*').order('created_at', { ascending: true }).range(from, to) as any,
    );
}

/**
 * Directory tối thiểu của tất cả thành viên active — dùng để hiển thị tên (full_name)
 * trong UI cho user thường, tránh fall-back về UUID.
 *
 * Yêu cầu migration 013 đã được apply (RPC `list_profile_directory`).
 * Nếu RPC chưa tồn tại, fallback xuống `listProfiles()` (admin sẽ thấy đủ,
 * user thường chỉ thấy chính mình).
 */
export interface ProfileDirectoryEntry {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
}

let DIRECTORY_RPC_AVAILABLE: boolean | null = null;

export async function fetchProfileDirectory(): Promise<ProfileDirectoryEntry[]> {
    if (DIRECTORY_RPC_AVAILABLE !== false) {
        const { data, error } = await supabase.rpc('list_profile_directory');
        if (!error && Array.isArray(data)) {
            DIRECTORY_RPC_AVAILABLE = true;
            return data as ProfileDirectoryEntry[];
        }
        if (
            error &&
            (error.code === '42883' ||
                error.code === 'PGRST202' ||
                /function .* does not exist|could not find/i.test(error.message || ''))
        ) {
            DIRECTORY_RPC_AVAILABLE = false;
        }
    }
    // Fallback: dùng listProfiles. Nếu user không phải admin, RLS chỉ trả profile chính mình.
    const profiles = await listProfiles();
    return profiles.map(p => ({
        id: p.id,
        full_name: p.full_name ?? null,
        email: (p as any).email ?? null,
        role: p.role,
    }));
}

/**
 * Convert một entry directory thành tên hiển thị thân thiện.
 * Ưu tiên `full_name` → email-prefix → "Người dùng <id8>".
 */
export function displayNameFromEntry(entry: ProfileDirectoryEntry | undefined, fallbackId?: string): string {
    if (entry) {
        const name = (entry.full_name || '').trim();
        if (name) return name;
        if (entry.email) return entry.email.split('@')[0];
    }
    const id = fallbackId || entry?.id || '';
    return id ? `Người dùng ${id.slice(0, 6)}` : 'Người dùng';
}

export async function updateProfileRole(userId: string, role: UserRole): Promise<boolean> {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    return !error;
}

export async function toggleUserActive(userId: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId);
    return !error;
}

export async function createUserByAdmin(
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
): Promise<{ error: string | null }> {
    const { error } = await supabase.functions.invoke('admin-create-user', {
        body: { email, password, full_name: fullName, role },
    });
    if (error) return { error: error.message };
    return { error: null };
}

export async function adminResetPassword(targetUserId: string, newPassword: string): Promise<{ error: string | null }> {
    const { error } = await supabase.functions.invoke('admin-reset-password', {
        body: { target_user_id: targetUserId, new_password: newPassword },
    });
    if (error) return { error: error.message };
    return { error: null };
}
