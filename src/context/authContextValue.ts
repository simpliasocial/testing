import { createContext } from 'react';
import type { AuthError, User } from '@supabase/supabase-js';

export type UserRole = 'platform_admin' | 'company_admin' | 'operator';

export interface AuthContextType {
    user: User | null;
    role: UserRole | null;
    loading: boolean;
    signIn: (username: string, pass: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
