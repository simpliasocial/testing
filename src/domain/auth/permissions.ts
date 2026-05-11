import type { UserRole } from '@/context/authContextValue';

/** Tab IDs as defined in DashboardLayout */
export type TabId = 'overview' | 'funnel' | 'operational' | 'followup' 
  | 'performance' | 'trends' | 'scoring' | 'chats' | 'reporting';

const ALL_TABS: TabId[] = [
  'overview', 'funnel', 'operational', 'followup', 
  'performance', 'trends', 'scoring', 'chats', 'reporting',
];

const OPERATOR_TABS: TabId[] = ['followup', 'performance'];

/** Returns the tabs visible for a given role */
export function getVisibleTabs(role: UserRole | null): TabId[] {
  if (!role) return [];
  if (role === 'operator') return OPERATOR_TABS;
  return ALL_TABS; // both platform_admin and company_admin see all tabs
}

/** Returns the default landing tab for a role */
export function getDefaultTab(role: UserRole | null): TabId {
  if (role === 'operator') return 'followup';
  return 'overview';
}

/** Whether the role can access admin-level features (tag config, etc.) */
export function isAdmin(role: UserRole | null): boolean {
  return role === 'platform_admin';
}
