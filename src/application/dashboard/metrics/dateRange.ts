import type { DashboardDataFilters } from "../viewModel";

export interface DashboardDateRange {
    start: Date;
    end: Date;
}

export const resolveDashboardFiltersInput = (
    filtersOrMonth: DashboardDataFilters | Date | null = {},
): DashboardDataFilters => {
    if (!filtersOrMonth) return {};

    if (filtersOrMonth instanceof Date) {
        return {
            startDate: new Date(filtersOrMonth.getFullYear(), filtersOrMonth.getMonth(), 1),
            endDate: new Date(filtersOrMonth.getFullYear(), filtersOrMonth.getMonth() + 1, 0),
        };
    }

    return filtersOrMonth;
};

export const resolveDashboardDateRange = (filters: DashboardDataFilters): DashboardDateRange => {
    if (filters.startDate && filters.endDate) {
        const start = new Date(filters.startDate);
        const end = new Date(filters.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    if (filters.startDate) {
        const start = new Date(filters.startDate);
        const end = new Date();
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    return {
        start: new Date(2024, 0, 1),
        end: new Date(2030, 0, 1),
    };
};
