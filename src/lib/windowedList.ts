export const WINDOWED_LIST_VISIBLE_ROWS = 10;
export const WINDOWED_LIST_MAX_RENDERED_ROWS = 20;
export const WINDOWED_TABLE_MAX_HEIGHT_PX = 760;

export type WindowedListState<T> = {
    total: number;
    visibleItems: T[];
    hasVerticalScroll: boolean;
    isTrimmed: boolean;
};

export const buildWindowedListState = <T,>(items: T[]): WindowedListState<T> => ({
    total: items.length,
    visibleItems: items.slice(0, WINDOWED_LIST_MAX_RENDERED_ROWS),
    hasVerticalScroll: items.length > WINDOWED_LIST_VISIBLE_ROWS,
    isTrimmed: items.length > WINDOWED_LIST_MAX_RENDERED_ROWS,
});
