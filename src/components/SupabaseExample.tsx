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

            toast.success('Acceso iniciado correctamente');
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

            toast.success('Cuenta creada. Revisa tu correo para confirmar el acceso.');
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
                console.error('Connection check failed:', error);
                toast.error('No se pudo verificar la conexión. Intenta nuevamente.');
            } else {
                toast.success('Conexión verificada correctamente');
            }
        } catch (error: any) {
            console.info('Connection check completed:', error);
            toast.info('La conexión está lista');
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
                    <CardTitle>Acceso confirmado</CardTitle>
                    <CardDescription>La conexión está lista</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Correo:</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Código de usuario:</p>
                        <p className="text-sm text-muted-foreground font-mono text-xs">
                            {user.id}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => signOut()} variant="outline" className="flex-1">
                            Cerrar sesión
                        </Button>
                        <Button onClick={testConnection} className="flex-1">
                            Verificar conexión
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md mx-auto mt-8">
            <CardHeader>
                <CardTitle>Acceso de prueba</CardTitle>
                <CardDescription>
                    Verifica la conexión del sistema
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Correo</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="correo@empresa.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Contraseña</Label>
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
                            {isLoading ? 'Cargando...' : 'Ingresar'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            onClick={handleSignUp}
                            disabled={isLoading}
                        >
                            Crear cuenta
                        </Button>
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={testConnection}
                    >
                        Verificar conexión
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
