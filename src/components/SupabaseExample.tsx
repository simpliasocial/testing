import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupabaseAuth } from '@/hooks/useSupabase';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/**
 * Example component showing how to use Supabase.
 * This component demonstrates how to:
 * - Authenticate users
 * - Use the useSupabaseAuth hook
 * - Run basic queries
 */
export function SupabaseExample() {
    const { user, loading, signOut } = useSupabaseAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            toast.success('Sign-in successful!');
        } catch (error: any) {
            toast.error(error.message || 'Error signing in');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignUp = async () => {
        setIsLoading(true);

        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) throw error;

            toast.success('Account created! Check your email to confirm.');
        } catch (error: any) {
            toast.error(error.message || 'Error creating account');
        } finally {
            setIsLoading(false);
        }
    };

    const testConnection = async () => {
        try {
            const { data, error } = await supabase
                .from('_test_table_')
                .select('*')
                .limit(1);

            if (error) {
                toast.error('Connection failed: ' + error.message);
            } else {
                toast.success('✅ Successfully connected to Supabase!');
            }
        } catch (error: any) {
            toast.info('Database connected (test table does not exist yet)');
        }
    };

    if (loading) {
        return (
            <Card className="w-full max-w-md mx-auto mt-8">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (user) {
        return (
            <Card className="w-full max-w-md mx-auto mt-8">
                <CardHeader>
                    <CardTitle>Authenticated! ✅</CardTitle>
                    <CardDescription>You are connected to Supabase</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Email:</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium">User ID:</p>
                        <p className="text-sm text-muted-foreground font-mono text-xs">
                            {user.id}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => signOut()} variant="outline" className="flex-1">
                            Sign Out
                        </Button>
                        <Button onClick={testConnection} className="flex-1">
                            Test Connection
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md mx-auto mt-8">
            <CardHeader>
                <CardTitle>Supabase Auth Demo</CardTitle>
                <CardDescription>
                    Test the Supabase connection
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="you@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Loading...' : 'Sign In'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            onClick={handleSignUp}
                            disabled={isLoading}
                        >
                            Create Account
                        </Button>
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={testConnection}
                    >
                        🔌 Test Connection
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
