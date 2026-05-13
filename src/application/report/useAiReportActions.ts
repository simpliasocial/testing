import { downloadBase64File, invokeAiReportFunction } from "@/infrastructure/report/AiReportClient";
export type { AiReportDownloadResponse } from "@/infrastructure/report/AiReportClient";

export const useAiReportActions = () => ({
    invokeAiReportFunction,
    downloadBase64File,
});
