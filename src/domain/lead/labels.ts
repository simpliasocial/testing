import { cleanText } from "../common/types";

export const normalizeLabels = (labels: unknown): string[] => {
    if (!Array.isArray(labels)) return [];

    return Array.from(new Set(
        labels
            .map((label) => cleanText(label))
            .filter(Boolean),
    )).sort((left, right) => left.localeCompare(right));
};

export const labelsMatch = (left: unknown, right: unknown) => {
    const leftLabels = normalizeLabels(left);
    const rightLabels = normalizeLabels(right);

    return leftLabels.length === rightLabels.length
        && leftLabels.every((label, index) => label === rightLabels[index]);
};

export const hasAnyLabel = (labels: unknown, candidates: string[] = []) => {
    const labelSet = new Set(normalizeLabels(labels));
    return candidates.some((candidate) => labelSet.has(cleanText(candidate)));
};

export const getLabelDelta = (previousLabels: unknown, nextLabels: unknown) => {
    const previous = normalizeLabels(previousLabels);
    const next = normalizeLabels(nextLabels);
    const previousSet = new Set(previous);
    const nextSet = new Set(next);

    return {
        previous,
        next,
        added: next.filter((label) => !previousSet.has(label)),
        removed: previous.filter((label) => !nextSet.has(label)),
    };
};
