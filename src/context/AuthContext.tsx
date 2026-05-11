import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { AuthContext, type UserRole } from './authContextValue';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                setRole(session.user.email === 'admin@simplia.com' ? 'admin' : 'user');
            }
            setLoading(false);
        });

        // Listen for changes on auth state (sign in, sign out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                setRole(session.user.email === 'admin@simplia.com' ? 'admin' : 'user');
            } else {
                setRole(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (username: string, pass: string) => {
        // Mapping username to email as requested
        let email = username;
        if (username.toLowerCase() === 'admin') email = 'admin@simplia.com';
        else if (username.toLowerCase() === 'test') email = 'test@simplia.com';
        else if (!username.includes('@')) email = `${username}@simplia.com`;

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });

        return { error };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        localStorage.removeItem('isAuthenticated'); // Cleanup legacy if exists
    };

    return (
        <AuthContext.Provider value={{ user, role, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};
