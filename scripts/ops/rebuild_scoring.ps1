$ErrorActionPreference = 'Stop'
$file = "src\pages\layers\LeadScoringLayer.tsx"
$lines = Get-Content $file

# Extract JSX return block (lines 619-1180, 0-indexed: 618..1179)
$jsxLines = $lines[618..1179]

# Fix JSX references: handleOpenHistory -> openHistory, setViewingLead(null) -> closeHistory, openViewingLeadInChatwoot -> openInChatwoot
$jsxBlock = ($jsxLines -join "`n")
$jsxBlock = $jsxBlock -replace 'handleOpenHistory', 'openHistory'
$jsxBlock = $jsxBlock -replace 'setViewingLead\(null\)', 'closeHistory()'
$jsxBlock = $jsxBlock -replace 'openViewingLeadInChatwoot', 'openInChatwoot'
$jsxBlock = $jsxBlock -replace '\!\!viewingLead', '!!viewingLead'
$jsxBlock = $jsxBlock -replace '\(open\) => !open && setViewingLead\(null\)', '(open) => !open && closeHistory()'
$jsxBlock = $jsxBlock -replace 'setSettingsDirty\(true\);\s*\n\s*setScoreAttributeKeyDraft', 'setScoreAttributeKeyDraft'

$header = @'
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/context/useAuth";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDashboardContext } from "@/context/useDashboardContext";
import { formatDateTime, getConversationMessageRole, getInitials, getLeadExternalUrl, getLeadName, getLeadPhone, getMessageText, getMessagePreview, getMessageTimestamp } from "@/lib/leadDisplay";
import { formatBusinessLabel, formatFieldLabel } from "@/lib/displayCopy";
import { KPICard } from "@/components/dashboard/KPICard";
import { formatScoreValue, getBucketRangeLabel, SCORE_BUCKET_COPY, SCORE_BUCKET_ORDER, type ScoreBucket } from "@/lib/leadScoreClassification";
import { WINDOWED_TABLE_MAX_HEIGHT_PX } from "@/lib/windowedList";
import { extractLeadLabels, type ScoreDimension } from "@/features/scoring/model/leadScoringModel";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BadgeCheck, ChevronDown, Clock, ExternalLink, Gauge, Loader2, MessageSquare, Search, Settings2, Target, TrendingUp } from "lucide-react";
import { useScoringConfig } from "@/features/scoring/hooks/useScoringConfig";
import { useScoringData } from "@/features/scoring/hooks/useScoringData";
import { useScoringHistory } from "@/features/scoring/hooks/useScoringHistory";
import { FilterSelect, MultiFilterSelect, ChartCard, EmptyState } from "@/features/scoring/components/ScoringShared";

const BUCKET_ORDER = SCORE_BUCKET_ORDER;
const BUCKET_COPY = SCORE_BUCKET_COPY;

const getTooltipPayloadNumber = (item: unknown, key: string) => {
    const payload = (item as { payload?: Record<string, unknown> })?.payload;
    const value = Number(payload?.[key] || 0);
    return Number.isFinite(value) ? value : 0;
};

const LeadScoringLayer = () => {
    const { loading } = useDashboardContext();
    const { role } = useAuth();

    const {
        configOpen, setConfigOpen, settingsDirty, savingSettings,
        scoreAttributeKeyDraft, setScoreAttributeKeyDraft,
        thresholdHotDraft, setThresholdHotDraft, thresholdWarmDraft, setThresholdWarmDraft,
        appointmentLabelsDraft, thresholdValidationError, noScoringAttributeAvailable,
        actualLabels, scoreAttributeOptions, selectedScoreAttribute,
        activeScoreAttributeKey, activeAppointmentLabels, activeScoreThresholds,
        toggleAppointmentLabel, saveScoringConfig, restoreDefaultConfig,
    } = useScoringConfig();

    const {
        campaignFilter, setCampaignFilter, labelFilters, setLabelFilters,
        ownerFilter, setOwnerFilter, bucketFilter, setBucketFilter,
        detailSearch, setDetailSearch, scoreDimension, setScoreDimension,
        filterOptions, filteredLeads, scoredLeadCount, filteredMissingScoreCount,
        kpis, bucketDistribution, averageByChannel, averageByDimension, scoreDomain, conversionByBucket,
        windowedDetailRows, scoreFieldLabel, activeFilterSummary, detailShowingLabel,
        hotLeads, hotAppointments,
    } = useScoringData({
        activeScoreAttributeKey, activeScoreThresholds, activeAppointmentLabels,
        selectedScoreAttribute, actualLabels,
    });

    const { viewingLead, historyMessages, loadingHistory, openHistory, closeHistory, openInChatwoot } = useScoringHistory();

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

'@

$footer = @'

export default LeadScoringLayer;
'@

$newContent = $header + "`n" + $jsxBlock + "`n" + $footer

Set-Content -Path $file -Value $newContent -Encoding UTF8 -NoNewline

Write-Host "File rewritten. New line count: $((Get-Content $file).Count)"
