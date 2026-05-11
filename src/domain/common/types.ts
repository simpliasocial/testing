export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const asRecord = (value: unknown): UnknownRecord =>
    isRecord(value) ? value : {};

export const cleanText = (value: unknown) => String(value ?? "").trim();

export const normalizeSearchText = (value: unknown) =>
    cleanText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
