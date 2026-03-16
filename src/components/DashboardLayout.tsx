import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, MessageSquare } from 'lucide-react';
import Index from '@/pages/Index';
import ChatwootPage from '@/pages/ChatwootPage';

const DashboardLayout = () => {
    const [activeTab, setActiveTab] = useState('dashboard');

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Testings Dashboard</h1>
                        <p className="text-muted-foreground mt-1">Overview of performance and key metrics</p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => {
                            localStorage.removeItem('isAuthenticated');
                            window.location.href = '/login';
                        }}
                        className="flex items-center gap-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                        Log out
                    </Button>
                </div>

                <Tabs defaultValue="dashboard" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="grid w-full max-w-md grid-cols-2">
                        <TabsTrigger value="dashboard" className="flex items-center gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            Dashboard
                        </TabsTrigger>
                        <TabsTrigger value="chats" className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Chatwoot Chats
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="dashboard" className="space-y-6">
                        <Index />
                    </TabsContent>

                    <TabsContent value="chats" className="space-y-6">
                        <ChatwootPage />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default DashboardLayout;
