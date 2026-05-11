import { createContext } from 'react';
import { DEFAULT_TAG_CONFIG } from '@/domain/dashboard';
import type { DashboardDataContextType } from './dashboardDataTypes';

export const DashboardDataContext = createContext<DashboardDataContextType>({
    conversations: [],
    labelEvents: [],
    commercialAuditEvents: [],
    inboxes: [],
    labels: [],
    contactAttributeDefinitions: [],
    tagSettings: DEFAULT_TAG_CONFIG,
    loading: true,
    error: null,
    dataSource: 'HYBRID',
    lastLiveFetchAt: null,
    liveError: null,
    historicalError: null,
    updateTagSettings: async () => { },
    globalFilters: {},
    setGlobalFilters: () => { },
    replaceConversation: async () => { },
    refetch: async () => { }
});
