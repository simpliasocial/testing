import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Custom hook to get the authenticated Supabase user.
 * @returns {User | null} The authenticated user or null.
 */
export function useSupabaseAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Listen for authentication changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    return {
        user,
        session,
        loading,
        signOut: () => supabase.auth.signOut(),
    };
}

/**
 * Custom hook to run Supabase queries with state handling.
 * @param table Table name.
 * @param query Custom query function.
 */
export function useSupabaseQuery<T>(
    table: string,
    query?: (queryBuilder: any) => any
) {
    const [data, setData] = useState<T[] | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                let queryBuilder = supabase.from(table).select('*');

                if (query) {
                    queryBuilder = query(queryBuilder);
                }

                const { data, error } = await queryBuilder;

                if (error) throw error;
                setData(data);
            } catch (err) {
                setError(err as Error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [table]);

    return { data, error, loading };
}
