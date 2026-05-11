export type { ScoreBucket, ScoreThresholds } from "@/domain/lead";
export {
    bucketFromScore,
    DEFAULT_SCORE_THRESHOLDS,
    formatScoreValue,
    formatThresholdValue,
    getBucketRangeLabel,
    normalizeScoreThresholds,
    parseNumericScore,
    SCORE_BUCKET_ORDER,
} from "@/domain/lead";

import type { ScoreBucket } from "@/domain/lead";

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
        description: "Señal inicial, puntaje menor o sin puntaje todavía.",
        color: "#2563eb",
        bg: "bg-blue-50 text-blue-700 border-blue-200",
    },
};
