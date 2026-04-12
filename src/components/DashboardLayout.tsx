import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
    LogOut,
    LayoutDashboard,
    Filter,
    Zap,
    ListTodo,
    BarChart3,
    TrendingUp,
    FileText,
    Calendar,
    Search
} from 'lucide-react';
import ExecutiveOverview from '@/pages/layers/ExecutiveOverview';
import FunnelLayer from '@/pages/layers/FunnelLayer';
import OperationalEfficiency from '@/pages/layers/OperationalEfficiency';
import LeadActionQueue from '@/pages/layers/LeadActionQueue';
import PerformanceLayer from '@/pages/layers/PerformanceLayer';
import TrendLayer from '@/pages/layers/TrendLayer';
import ReportingLayer from '@/pages/layers/ReportingLayer';
import ChatwootPage from '@/pages/ChatwootPage';
import ReportsPage from '@/pages/ReportsPage';
import { useDashboardContext } from '@/context/DashboardDataContext';
import { Database, Activity } from 'lucide-react';

const Placeholder = ({ name }: { name: string }) => (
    <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-xl bg-muted/30">
        <div className="p-4 bg-background rounded-full shadow-sm mb-4">
            <Search className="h-8 w-8 text-muted-foreground opacity-20" />
        </div>
        <h3 className="text-lg font-medium text-foreground">Capa en Construcción</h3>
        <p className="text-sm text-muted-foreground mt-1">{name}</p>
    </div>
);

const DashboardLayout = () => {
    const [activeTab, setActiveTab] = useState('overview');
    const { dataSource } = useDashboardContext();

    const handleLogout = () => {
        localStorage.removeItem('isAuthenticated');
        window.location.href = '/login';
    };

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-background">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-primary p-1.5 rounded-lg">
                            <BarChart3 className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-foreground leading-none">SimpliaLeads</h1>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium mt-1">Control Comercial</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {dataSource === 'API' ? (
                            <div className="hidden md:flex items-center bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-xs font-semibold border border-green-200">
                                <Activity className="w-3 h-3 mr-2 animate-pulse" />
                                Vivo: Chatwoot API
                            </div>
                        ) : (
                            <div className="hidden md:flex items-center bg-amber-500/10 text-amber-600 px-3 py-1 rounded-full text-xs font-semibold border border-amber-200">
                                <Database className="w-3 h-3 mr-2" />
                                Historial: Supabase
                            </div>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogout}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden sm:inline">Salir</span>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    {/* Modular Navigation Tabs */}
                    <div className="overflow-x-auto pb-2 -mx-1 px-1">
                        <TabsList className="inline-flex h-auto p-1 bg-background border shadow-sm rounded-xl">
                            {[
                                { id: 'overview', label: 'Estrategia', icon: LayoutDashboard },
                                { id: 'funnel', label: 'Embudo', icon: Filter },
                                { id: 'operational', label: 'Operación', icon: Zap },
                                { id: 'followup', label: 'Seguimiento', icon: ListTodo },
                                { id: 'performance', label: 'Rendimiento', icon: BarChart3 },
                                { id: 'trends', label: 'Tendencias', icon: TrendingUp },
                                { id: 'chats', label: 'Conversaciones', icon: Search },
                                { id: 'reporting', label: 'Reportes', icon: FileText },
                            ].map((tab) => (
                                <TabsTrigger
                                    key={tab.id}
                                    value={tab.id}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all font-medium text-sm"
                                >
                                    <tab.icon className="h-4 w-4" />
                                    {tab.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>

                    <div className="mt-6 transition-all duration-300">
                        <TabsContent value="overview" className="mt-0 space-y-6">
                            <ExecutiveOverview />
                        </TabsContent>

                        <TabsContent value="funnel" className="mt-0">
                            <FunnelLayer />
                        </TabsContent>

                        <TabsContent value="operational" className="mt-0">
                            <OperationalEfficiency />
                        </TabsContent>

                        <TabsContent value="followup" className="mt-0">
                            <LeadActionQueue />
                        </TabsContent>

                        <TabsContent value="performance" className="mt-0">
                            <PerformanceLayer />
                        </TabsContent>

                        <TabsContent value="trends" className="mt-0">
                            <TrendLayer />
                        </TabsContent>

                        <TabsContent value="chats" className="mt-0">
                            <ChatwootPage />
                        </TabsContent>

                        <TabsContent value="reporting" className="mt-0">
                            <ReportingLayer />
                        </TabsContent>
                    </div>
                </Tabs>
            </main>
        </div>
    );
};

export default DashboardLayout;
