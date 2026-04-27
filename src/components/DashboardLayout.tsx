import { useEffect, useState } from 'react';
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
    Search,
    Database,
    Activity,
    RefreshCw,
    Gauge
} from 'lucide-react';
import ExecutiveOverview from '@/pages/layers/ExecutiveOverview';
import FunnelLayer from '@/pages/layers/FunnelLayer';
import OperationalEfficiency from '@/pages/layers/OperationalEfficiency';
import LeadActionQueue from '@/pages/layers/LeadActionQueue';
import PerformanceLayer from '@/pages/layers/PerformanceLayer';
import TrendLayer from '@/pages/layers/TrendLayer';
import LeadScoringLayer from '@/pages/layers/LeadScoringLayer';
import ReportingLayer from '@/pages/layers/ReportingLayer';
import ChatwootPage from '@/pages/ChatwootPage';
import { useDashboardContext } from '@/context/DashboardDataContext';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { ChannelSelector } from '@/components/dashboard/ChannelSelector';
import { TagConfigDialog } from '@/components/dashboard/TagConfigDialog';
import { TabExportMenu } from '@/components/dashboard/TabExportMenu';
import type { ReportTabId } from '@/lib/reportCatalog';
import { startOfMonth, endOfMonth } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useAuth } from '@/context/AuthContext';

const DashboardLayout = () => {
    const [activeTab, setActiveTab] = useState('overview');
    const {
        dataSource,
        globalFilters,
        setGlobalFilters,
        tagSettings,
        updateTagSettings,
        labels,
        refetch,
        lastLiveFetchAt,
        liveError
    } = useDashboardContext();
    const { role, signOut } = useAuth();

    useEffect(() => {
        if (!globalFilters.startDate) {
            setGlobalFilters({
                startDate: startOfMonth(new Date()),
                endDate: endOfMonth(new Date()),
                selectedInboxes: []
            });
        }
    }, [globalFilters.startDate, setGlobalFilters]);

    const handleDateRangeChange = (range: DateRange | undefined) => {
        setGlobalFilters(prev => ({ ...prev, startDate: range?.from, endDate: range?.to }));
    };

    const handleInboxesChange = (inboxes: number[]) => {
        setGlobalFilters(prev => ({ ...prev, selectedInboxes: inboxes }));
    };

    const handleLogout = async () => {
        await signOut();
        window.location.href = '/login';
    };

    const renderTabExport = (tabId: ReportTabId) => (
        <div className="flex justify-end">
            <TabExportMenu tabId={tabId} compact />
        </div>
    );

    const statusBadge = () => {
        if (dataSource === 'HYBRID') {
            return (
                <div
                    className="hidden md:flex items-center bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-xs font-semibold border border-green-200"
                    title={lastLiveFetchAt ? `Ultima actualizacion live: ${lastLiveFetchAt.toLocaleTimeString()}` : undefined}
                >
                    <Activity className="w-3 h-3 mr-2 animate-pulse" />
                    Vivo + Historial
                </div>
            );
        }

        if (dataSource === 'API_ONLY') {
            return (
                <div className="hidden md:flex items-center bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-xs font-semibold border border-green-200">
                    <Activity className="w-3 h-3 mr-2 animate-pulse" />
                    Vivo: Chatwoot API
                </div>
            );
        }

        return (
            <div className="hidden md:flex items-center bg-amber-500/10 text-amber-600 px-3 py-1 rounded-full text-xs font-semibold border border-amber-200">
                <Database className="w-3 h-3 mr-2" />
                Historial: Supabase
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-background">
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div>
                            <img
                                src="/logo_simplia.png"
                                alt="Simplia"
                                className="h-8 w-auto object-contain"
                            />
                            <h1 className="sr-only">Simplia Leads</h1>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium mt-1">Control Comercial</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {statusBadge()}
                        {liveError && (
                            <div className="hidden lg:flex items-center bg-amber-500/10 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold border border-amber-200">
                                Live con error
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
                    <div className="overflow-x-auto pb-2 -mx-1 px-1">
                        <TabsList className="inline-flex h-auto p-1 bg-background border shadow-sm rounded-xl overflow-x-auto whitespace-nowrap">
                            {[
                                { id: 'overview', label: 'Estrategia', icon: LayoutDashboard },
                                { id: 'funnel', label: 'Embudo', icon: Filter },
                                { id: 'operational', label: 'Operacion', icon: Zap },
                                { id: 'followup', label: 'Seguimiento', icon: ListTodo },
                                { id: 'performance', label: 'Rendimiento Humano', icon: BarChart3 },
                                { id: 'trends', label: 'Tendencias', icon: TrendingUp },
                                { id: 'scoring', label: 'Scores', icon: Gauge },
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

                    {activeTab !== 'followup' && (
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
                            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                                <ChannelSelector
                                    selectedInboxes={globalFilters.selectedInboxes || []}
                                    onChange={handleInboxesChange}
                                />
                                <DateRangePicker
                                    value={{ from: globalFilters.startDate, to: globalFilters.endDate }}
                                    onChange={handleDateRangeChange}
                                />
                                {activeTab === 'overview' && role === 'admin' && (
                                    <>
                                        <div className="h-8 w-px bg-border mx-1 hidden sm:block" />
                                        <TagConfigDialog
                                            availableLabels={labels}
                                            config={tagSettings}
                                            onSave={updateTagSettings}
                                        />
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto justify-end">
                                <Button variant="outline" size="icon" onClick={refetch} title="Actualizar datos">
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 transition-all duration-300">
                        <TabsContent value="overview" className="mt-0 space-y-6">
                            {renderTabExport('overview')}
                            <ExecutiveOverview />
                        </TabsContent>

                        <TabsContent value="funnel" className="mt-0 space-y-6">
                            {renderTabExport('funnel')}
                            <FunnelLayer />
                        </TabsContent>

                        <TabsContent value="operational" className="mt-0 space-y-6">
                            {renderTabExport('operational')}
                            <OperationalEfficiency />
                        </TabsContent>

                        <TabsContent value="followup" className="mt-0">
                            <LeadActionQueue />
                        </TabsContent>

                        <TabsContent value="performance" className="mt-0 space-y-6">
                            {renderTabExport('performance')}
                            <PerformanceLayer />
                        </TabsContent>

                        <TabsContent value="trends" className="mt-0 space-y-6">
                            {renderTabExport('trends')}
                            <TrendLayer />
                        </TabsContent>

                        <TabsContent value="scoring" className="mt-0 space-y-6">
                            {renderTabExport('scoring')}
                            <LeadScoringLayer />
                        </TabsContent>

                        <TabsContent value="chats" className="mt-0 space-y-6">
                            {renderTabExport('chats')}
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
