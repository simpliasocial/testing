import type { Dispatch, SetStateAction } from 'react';
import type { MinifiedConversation } from '../services/StorageService';
import type { CommercialAuditEvent } from '../lib/commercialFacts';
import type { ContactAttributeDefinition, DashboardFilters, TagConfig } from '@/domain/dashboard';
import type { UnknownRecord } from '@/domain/common/types';
import type { ConversationLabelEvent } from '@/domain/conversation';
import type { Inbox, LeadStage } from '@/domain/lead';

export interface ResolvedConversation extends MinifiedConversation {
    resolvedLabels: string[];
    resolvedAttrs: UnknownRecord;
    resolvedStage: LeadStage;
}

export type DashboardDataSource = 'HYBRID' | 'API_ONLY' | 'SUPABASE_ONLY';

export type DashboardDataContextType = {
    conversations: ResolvedConversation[];
    labelEvents: ConversationLabelEvent[];
    commercialAuditEvents: CommercialAuditEvent[];
    inboxes: Inbox[];
    labels: string[];
    contactAttributeDefinitions: ContactAttributeDefinition[];
    tagSettings: TagConfig;
    loading: boolean;
    error: string | null;
    dataSource: DashboardDataSource;
    lastLiveFetchAt: Date | null;
    liveError: string | null;
    historicalError: string | null;
    updateTagSettings: (config: TagConfig) => Promise<void>;
    globalFilters: DashboardFilters;
    setGlobalFilters: Dispatch<SetStateAction<DashboardFilters>>;
    replaceConversation: (conversation: MinifiedConversation) => Promise<void>;
    refetch: () => Promise<void>;
};
