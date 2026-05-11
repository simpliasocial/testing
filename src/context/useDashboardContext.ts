import { useContext } from 'react';
import { DashboardDataContext } from './dashboardDataContextValue';

export const useDashboardContext = () => useContext(DashboardDataContext);
