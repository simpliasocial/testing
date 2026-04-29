export type ScoreBucket = "hot" | "warm" | "cold" | "low";

export interface ScoreThresholds {
    hotMin: number;
    warmMin: number;
    coldMin: number;
    highMin?: number;
    mediumMin?: number;
}

export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = {
    hotMin: 70,
    warmMin: 45,
    coldMin: 20,
};

export const SCORE_BUCKET_ORDER: ScoreBucket[] = ["hot", "warm", "cold", "low"];

export const SCORE_BUCKET_COPY: Record<ScoreBucket, {
    label: string;
    description: string;
    color: string;
    bg: string;
}> = {
    hot: {
        label: "Caliente",
        description: "Intención fuerte de compra, agenda o avance pronto.",
        color: "#dc2626",
        bg: "bg-red-50 text-red-700 border-red-200",
    },
    warm: {
        label: "Tibio",
        description: "Señales accionables como precio, disponibilidad o producto específico.",
        color: "#d97706",
        bg: "bg-amber-50 text-amber-700 border-amber-200",
    },
    cold: {
        label: "Frío",
        description: "Señal inicial sin intención comercial clara todavía.",
        color: "#2563eb",
        bg: "bg-blue-50 text-blue-700 border-blue-200",
    },
    low: {
        label: "Bajo",
        description: "Poca señal comercial, señales negativas o sin puntaje.",
        color: "#64748b",
        bg: "bg-slate-50 text-slate-700 border-slate-200",
    },
};

export const parseNumericScore = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;

    const normalized = String(value)
        .trim()
        .replace(",", ".")
        .replace(/[^0-9.-]/g, "");
    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeScoreThresholds = (thresholds?: Partial<ScoreThresholds> | null): ScoreThresholds => {
    const parsedHot = Number(thresholds?.hotMin);
    const parsedWarm = Number(thresholds?.warmMin);
    const parsedCold = Number(thresholds?.coldMin);

    const hotMin = Number.isFinite(parsedHot) ? parsedHot : DEFAULT_SCORE_THRESHOLDS.hotMin;
    const warmMin = Number.isFinite(parsedWarm) ? parsedWarm : DEFAULT_SCORE_THRESHOLDS.warmMin;
    const coldMin = Number.isFinite(parsedCold) ? parsedCold : DEFAULT_SCORE_THRESHOLDS.coldMin;

    if (hotMin <= warmMin || warmMin <= coldMin) {
        return { ...DEFAULT_SCORE_THRESHOLDS };
    }

    return { hotMin, warmMin, coldMin };
};

export const bucketFromScore = (score: number | null, thresholds: ScoreThresholds): ScoreBucket => {
    if (score === null) return "low";
    if (score >= thresholds.hotMin) return "hot";
    if (score >= thresholds.warmMin) return "warm";
    if (score >= thresholds.coldMin) return "cold";
    return "low";
};

export const getBucketRangeLabel = (bucket: ScoreBucket, thresholds: ScoreThresholds) => {
    if (bucket === "hot") return `Desde ${formatThresholdValue(thresholds.hotMin)}`;
    if (bucket === "warm") return `Desde ${formatThresholdValue(thresholds.warmMin)} y antes de ${formatThresholdValue(thresholds.hotMin)}`;
    if (bucket === "cold") return `Desde ${formatThresholdValue(thresholds.coldMin)} y antes de ${formatThresholdValue(thresholds.warmMin)}`;
    return `Menor a ${formatThresholdValue(thresholds.coldMin)} o sin puntaje`;
};

export const formatThresholdValue = (value: number) => Number.isInteger(value) ? String(value) : value.toString();

export const formatScoreValue = (score: number | null) => score === null ? "Sin puntaje" : String(score);
