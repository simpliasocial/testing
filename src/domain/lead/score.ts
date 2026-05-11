import type { ScoreBucket, ScoreThresholds } from "./types";

export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = {
    hotMin: 70,
    warmMin: 45,
};

export const SCORE_BUCKET_ORDER: ScoreBucket[] = ["hot", "warm", "cold"];

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
    const parsedHot = Number(thresholds?.hotMin ?? thresholds?.highMin);
    const parsedWarm = Number(thresholds?.warmMin ?? thresholds?.mediumMin);
    const hotMin = Number.isFinite(parsedHot) ? parsedHot : DEFAULT_SCORE_THRESHOLDS.hotMin;
    const warmMin = Number.isFinite(parsedWarm) ? parsedWarm : DEFAULT_SCORE_THRESHOLDS.warmMin;

    return hotMin > warmMin ? { hotMin, warmMin } : { ...DEFAULT_SCORE_THRESHOLDS };
};

export const bucketFromScore = (score: number | null, thresholds: ScoreThresholds): ScoreBucket => {
    if (score === null) return "cold";
    if (score >= thresholds.hotMin) return "hot";
    if (score >= thresholds.warmMin) return "warm";
    return "cold";
};

export const formatThresholdValue = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toString();

export const getBucketRangeLabel = (bucket: ScoreBucket, thresholds: ScoreThresholds) => {
    if (bucket === "hot") return `Desde ${formatThresholdValue(thresholds.hotMin)}`;
    if (bucket === "warm") return `Desde ${formatThresholdValue(thresholds.warmMin)} y antes de ${formatThresholdValue(thresholds.hotMin)}`;
    return `Menor a ${formatThresholdValue(thresholds.warmMin)} o sin puntaje`;
};

export const formatScoreValue = (score: number | null) =>
    score === null ? "Sin puntaje" : String(score);
