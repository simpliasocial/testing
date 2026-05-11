import { cleanText } from "../common/types";

export const parseAmount = (value: unknown) => {
    const raw = cleanText(value);
    if (!raw) return 0;

    const normalized = raw.includes(",") && !raw.includes(".")
        ? raw.replace(",", ".")
        : raw.replace(/,/g, "");
    const parsed = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ""));

    return Number.isFinite(parsed) ? parsed : 0;
};
