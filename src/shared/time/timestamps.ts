export const parseTimestampToUnix = (value: unknown): number => {
    if (!value) return 0;

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
        return numeric < 10000000000 ? Math.floor(numeric) : Math.floor(numeric / 1000);
    }

    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000);
};

export const parseTimestampToDate = (value: unknown): Date => {
    const unix = parseTimestampToUnix(value);
    return unix > 0 ? new Date(unix * 1000) : new Date(0);
};
