import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'planner' | 'approver' | 'viewer';

export interface UserProfile {
    id: string;
    full_name: string | null;
    role: UserRole;
    is_active: boolean;
    created_at: string;
    approval_levels: number[];    // which workflow levels this user can approve
    department: string | null;    // user department for filtering
}

export interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    isLoading: boolean;
    needsPasswordReset: boolean;
    clearPasswordReset: () => void;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    profile: null,
    isLoading: true,
    needsPasswordReset: false,
    clearPasswordReset: () => { },
    signIn: async () => ({ error: null }),
    signOut: async () => { },
    refreshProfile: async () => { },
});

export const useAuth = () => useContext(AuthContext);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [needsPasswordReset, setNeedsPasswordReset] = useState(false);

    const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
        try {
            const { data, error } = await Promise.race([
                supabase.from('profiles').select('*').eq('id', userId).single(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
            ]) as any;
            if (error || !data) return null;
            return data as UserProfile;
        } catch {
            return null;
        }
    };

    const refreshProfile = async () => {
        if (user) {
            const p = await fetchProfile(user.id);
            setProfile(p);
        }
    };

    useEffect(() => {
        console.log("AuthProvider: Initializing...");
        
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            console.log("AuthProvider: Session retrieved:", s ? "Logged In" : "No Session");
            setSession(s);
            setUser(s?.user ?? null);
            setIsLoading(false);
            if (s?.user) {
                console.log("AuthProvider: Fetching profile for", s.user.id);
                fetchProfile(s.user.id).then(p => {
                    console.log("AuthProvider: Profile loaded:", p ? p.role : "NULL (Empty profiles table?)");
                    setProfile(p);
                });
            }
        }).catch(err => {
            console.error("AuthProvider: Session error:", err);
            setIsLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
            console.log("AuthProvider: Auth state change:", _event, s ? "Logged In" : "Logged Out");
            setSession(s);
            setUser(s?.user ?? null);
            if (s?.user) {
                fetchProfile(s.user.id).then(setProfile);
            } else {
                setProfile(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        return { error: null };
    };

    const clearPasswordReset = () => setNeedsPasswordReset(false);

    const signOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
    };

    return (
        <AuthContext.Provider value={{ session, user, profile, isLoading, needsPasswordReset, clearPasswordReset, signIn, signOut, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};
