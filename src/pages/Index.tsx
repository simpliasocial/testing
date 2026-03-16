import { Users, Target, Calendar, TrendingUp, Zap, Database, Clock, MessageSquare, AlertTriangle, CheckCircle, Filter, BarChart3, LogOut, DollarSign, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KPICard } from "@/components/dashboard/KPICard";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { ResponseTimeGauge } from "@/components/dashboard/ResponseTimeGauge";
import { ChannelBreakdown } from "@/components/dashboard/ChannelBreakdown";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { DataCaptureChart } from "@/components/dashboard/DataCaptureChart";
import { DisqualificationReasons } from "@/components/dashboard/DisqualificationReasons";
import { WeeklyTrend } from "@/components/dashboard/WeeklyTrend";
import { RecentAppointments } from "@/components/dashboard/RecentAppointments";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Loader2 } from "lucide-react";

import { SectionCard } from "@/components/dashboard/SectionCard";

// Mock data based on User's Script Context
const monthlyTrendData = [
  { date: "Week 1", leads: 200, sqls: 80, appointments: 20 },
  { date: "Week 2", leads: 250, sqls: 100, appointments: 25 },
  { date: "Week 3", leads: 280, sqls: 110, appointments: 28 },
  { date: "Week 4", leads: 270, sqls: 110, appointments: 27 },
];
const ALL_TIME_VALUE = "-1";

const Index = () => {
  const [selectedMonth, setSelectedMonth] = useState<Date | null>(null); // null means "All Time"
  const [selectedWeek, setSelectedWeek] = useState<string>("1");
  const { loading, error, data, refetch } = useDashboardData(selectedMonth, selectedWeek);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Error loading dashboard data: {error}
      </div>
    );
  }

  const { kpis, funnelData, recentAppointments, channelData, weeklyTrend, monthlyTrend, disqualificationReasons, dataCapture, responseTime } = data;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const periodLabel = selectedMonth
    ? selectedMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : "Year 2026";

  const trendPeriodLabel = selectedMonth
    ? selectedMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }) + ' (Current Month)';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={refetch} title="Refresh data">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Select
            value={selectedMonth ? selectedMonth.getMonth().toString() : ALL_TIME_VALUE}
            onValueChange={(value) => {
              if (value === ALL_TIME_VALUE) {
                setSelectedMonth(null);
              } else {
                const newDate = new Date();
                newDate.setMonth(parseInt(value));
                newDate.setFullYear(2026); // Default to 2026 as requested
                setSelectedMonth(newDate);
              }
              setSelectedWeek("1"); // Reset week when month changes
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TIME_VALUE}>All Year</SelectItem>
              {[
                { value: "0", label: "January" },
                { value: "1", label: "February" },
                { value: "2", label: "March" },
                { value: "3", label: "April" },
                { value: "4", label: "May" },
                { value: "5", label: "June" },
                { value: "6", label: "July" },
                { value: "7", label: "August" },
                { value: "8", label: "September" },
                { value: "9", label: "October" },
                { value: "10", label: "November" },
                { value: "11", label: "December" },
              ].map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 mb-8">
        <KPICard
          title="Total Incoming Leads"
          value={kpis.totalLeads.toLocaleString()}
          subtitle={periodLabel}
          icon={Users}
          variant="primary"
          size="lg"
        />
        <KPICard
          title="Interested Leads"
          value={kpis.interestedLeads.toLocaleString()}
          subtitle={periodLabel}
          icon={Target}
          size="lg"
        />
        <KPICard
          title="Scheduled Appointments"
          value={kpis.scheduledAppointments.toLocaleString()}
          subtitle={periodLabel}
          icon={Calendar}
          size="lg"
        />
        <KPICard
          title="Unqualified"
          value={kpis.unqualified.toLocaleString()}
          subtitle={periodLabel}
          icon={AlertTriangle}
          variant="warning"
          size="lg"
        />
        <KPICard
          title="Scheduling Rate"
          value={`${kpis.schedulingRate}%`}
          subtitle={periodLabel}
          icon={TrendingUp}
          variant="accent"
          size="lg"
        />
        <KPICard
          title="Monthly Profit"
          value={formatCurrency(kpis.monthlyProfit)}
          subtitle={periodLabel}
          icon={DollarSign}
          variant="success"
          size="lg"
        />
        <KPICard
          title="Total Profit"
          value={formatCurrency(kpis.totalProfit)}
          subtitle="All Time"
          icon={DollarSign}
          variant="accent"
          size="lg"
        />
      </div>

      {/* Funnel & Mini KPIs */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <SectionCard
          title="Main Funnel"
          subtitle={`Conversion - ${periodLabel}`}
          icon={Filter}
          className="xl:col-span-2"
        >
          <FunnelChart stages={funnelData} />
        </SectionCard>

        <div className="space-y-4">
          <KPICard
            title="Response Rate"
            value={`${kpis.responseRate}%`}
            subtitle={periodLabel}
            icon={MessageSquare}
            variant="success"
          />
          <KPICard
            title="Interest Rate"
            value={`${kpis.totalLeads > 0 ? Math.round((kpis.interestedLeads / kpis.totalLeads) * 100) : 0}%`}
            subtitle={periodLabel}
            icon={CheckCircle}
          />
          <KPICard
            title="Scheduling Rate"
            value={`${kpis.schedulingRate}%`}
            subtitle={periodLabel}
            icon={Calendar}
          />
          <KPICard
            title="Discard Rate"
            value={`${kpis.discardRate}%`}
            subtitle={periodLabel}
            icon={AlertTriangle}
            variant="warning"
          />
        </div>
      </div>

      {/* Channel Breakdown & Weekly Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <SectionCard
          title="Channel Breakdown"
          subtitle={`Performance - ${periodLabel}`}
          icon={MessageSquare}
        >
          <ChannelBreakdown data={channelData} />
        </SectionCard>

        <SectionCard
          title="Weekly Trend"
          subtitle={`Week ${selectedWeek} - ${trendPeriodLabel}`}
          icon={TrendingUp}
          action={
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue placeholder="Week" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Week 1</SelectItem>
                <SelectItem value="2">Week 2</SelectItem>
                <SelectItem value="3">Week 3</SelectItem>
                <SelectItem value="4">Week 4</SelectItem>
                <SelectItem value="5">Week 5</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <WeeklyTrend data={weeklyTrend} />
          <div className="mt-4 flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-sm text-muted-foreground">Leads</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent" />
              <span className="text-sm text-muted-foreground">Appointments</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Recent Appointments Table */}
      <SectionCard
        title="Recent Scheduled Appointments"
        subtitle={`Captured data - ${periodLabel}`}
        icon={Calendar}
        className="mb-8"
      >
        <RecentAppointments appointments={recentAppointments} />
      </SectionCard>

      {/* SQLs & Disqualification */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <SectionCard
          title="Interest KPIs"
          subtitle={`Performance - ${periodLabel}`}
          icon={Target}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-secondary/50 text-center">
                <p className="text-3xl font-bold text-primary font-display">{kpis.interestedLeads}</p>
                <p className="text-sm text-muted-foreground">Interested Leads</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 text-center">
                <p className="text-3xl font-bold text-success font-display">{kpis.totalLeads > 0 ? Math.round((kpis.interestedLeads / kpis.totalLeads) * 100) : 0}%</p>
                <p className="text-sm text-muted-foreground">Interest Rate</p>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Average Qualification Time</span>
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold text-primary font-display">0 mins</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Disqualification Reasons"
          subtitle={`Reasons - ${periodLabel}`}
          icon={AlertTriangle}
          className="lg:col-span-2"
        >
          <DisqualificationReasons data={disqualificationReasons} />
        </SectionCard>
      </div>

      {/* Data Capture */}
      <SectionCard
        title="Data Capture"
        subtitle={`Efficiency - ${periodLabel}`}
        icon={Database}
        className="mb-8"
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <KPICard title="Completion Rate" value={`${dataCapture.completionRate}%`} variant="success" size="sm" />
          <KPICard title="Incomplete Conversations" value={dataCapture.incomplete.toString()} size="sm" />
          <KPICard title="Avg Capture Time" value="2.8 mins" size="sm" />
        </div>
        <DataCaptureChart data={dataCapture} />
      </SectionCard>

      {/* Operational Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <SectionCard
          title="Response Time"
          subtitle={`Average - ${periodLabel}`}
          icon={Clock}
          className="flex flex-col items-center"
        >
          <ResponseTimeGauge value={responseTime} />
        </SectionCard>

        <SectionCard
          title="Operational Performance"
          subtitle={`Metrics - ${periodLabel}`}
          icon={Zap}
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-bold text-primary font-display">0</p>
              <p className="text-xs text-muted-foreground">Messages/Conversation</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-bold text-success font-display">100%</p>
              <p className="text-xs text-muted-foreground">Uptime</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-bold text-warning font-display">0</p>
              <p className="text-xs text-muted-foreground">Agent Errors</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 text-center">
              <p className="text-2xl font-bold text-primary font-display">0%</p>
              <p className="text-xs text-muted-foreground">Error Rate</p>
            </div>
          </div>
          <div className="mt-6 p-4 rounded-lg bg-success/10 border border-success/20">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="font-medium text-foreground">SLA Met</p>
                <p className="text-sm text-muted-foreground">
                  Average response time within target (≤6 mins)
                </p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Monthly Trend */}
      <SectionCard
        title="Full Monthly Trend"
        subtitle={`Evolution - ${trendPeriodLabel}`}
        icon={BarChart3}
      >
        <TrendChart data={monthlyTrend} />
        <div className="mt-4 flex items-center justify-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-sm text-muted-foreground">Leads</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-sm text-muted-foreground">Interested</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-success" />
            <span className="text-sm text-muted-foreground">Appointments</span>
          </div>
        </div>
      </SectionCard>

      {/* Footer */}
      <footer className="mt-8 pt-6 border-t border-border text-center">
        <p className="text-sm text-muted-foreground">
          Performance Dashboard – Funnel Testings Agent · Powered by{" "}
          <span className="font-semibold text-primary">Simplia IA</span>
        </p>
      </footer>
    </div>
  );
};

export default Index;
