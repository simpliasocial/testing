import * as XLSX from "xlsx";
import { 
    normalizeCell, 
    normalizeText, 
    isBlankCell 
} from "./importNormalizers";
import { 
    LeadImportColumn, 
    ParsedLeadImportFile 
} from "../domain/importTypes";

export const chooseCsvEncoding = (buffer: ArrayBuffer) => {
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    let windows1252 = utf8;
    try {
        windows1252 = new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
    } catch {
        return { text: utf8, encoding: "utf-8" };
    }

    const score = (text: string) =>
        (text.match(/\uFFFD/g) || []).length * 3 +
        (text.match(/[ÃÂ][\x80-\xBFa-zA-Z]/g) || []).length;

    return score(windows1252) < score(utf8)
        ? { text: windows1252, encoding: "windows-1252" }
        : { text: utf8, encoding: "utf-8" };
};

export const getFileType = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase() || "xlsx";
    if (extension === "csv") return "csv";
    if (extension === "xls") return "xls";
    return "xlsx";
};

const nonEmptyCount = (row: unknown[] = []) => row.filter((cell) => !isBlankCell(cell)).length;

export const findHeaderRowIndex = (rows: unknown[][]) => {
    const candidates = rows.slice(0, 10);
    let bestIndex = 0;
    let bestScore = 0;

    candidates.forEach((row, index) => {
        const filled = nonEmptyCount(row);
        const textCells = row.filter((cell) => typeof cell === "string" && normalizeCell(cell).length > 0).length;
        const score = filled + textCells * 0.5;
        if (filled >= 2 && score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });

    return bestIndex;
};

export const buildColumns = (headerRow: unknown[], dataRows: unknown[][]): LeadImportColumn[] => {
    const maxColumns = Math.max(headerRow.length, ...dataRows.slice(0, 50).map((row) => row.length), 0);
    const headers = Array.from({ length: maxColumns }, (_, index) => {
        const rawHeader = normalizeCell(headerRow[index]);
        return rawHeader || `Columna ${index + 1}`;
    });

    const normalizedCounts = headers.reduce<Record<string, number>>((acc, header) => {
        const key = normalizeText(header) || header.toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const seen = new Map<string, number>();

    return headers.map((header, index) => {
        const normalizedHeader = normalizeText(header) || header.toLowerCase();
        const duplicateGroupSize = normalizedCounts[normalizedHeader] || 1;
        const duplicateIndex = (seen.get(normalizedHeader) || 0) + 1;
        seen.set(normalizedHeader, duplicateIndex);

        const values = dataRows.map((row) => normalizeCell(row[index])).filter(Boolean);
        const sampleValues = Array.from(new Set(values)).slice(0, 6);
        const suffix = duplicateGroupSize > 1 ? ` #${duplicateIndex}` : "";

        return {
            id: `c${index}`,
            index,
            header,
            displayName: `${header}${suffix}`,
            normalizedHeader,
            filledCount: values.length,
            sampleValues,
            duplicateGroupSize,
        };
    });
};

const detectSourceSystem = (columns: LeadImportColumn[]) => {
    const headers = columns.map((column) => column.normalizedHeader).join(" | ");
    if (
        headers.includes("nombre del lead") ||
        headers.includes("embudo de ventas") ||
        headers.includes("estatus del lead")
    ) {
        return "kommo";
    }
    return "excel";
};

export const readLeadImportFile = async (file: File): Promise<ParsedLeadImportFile> => {
    const fileType = getFileType(file.name);
    const buffer = await file.arrayBuffer();
    const encodingResult = fileType === "csv" ? chooseCsvEncoding(buffer) : undefined;
    const workbook = fileType === "csv"
        ? XLSX.read(encodingResult?.text || "", { type: "string", raw: true, cellDates: false })
        : XLSX.read(buffer, { type: "array", raw: true, cellDates: false });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("El archivo no tiene hojas legibles.");

    const worksheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        blankrows: false,
        raw: true,
    }) as unknown[][];

    if (allRows.length === 0) throw new Error("El archivo está vacío.");

    const headerRowIndex = findHeaderRowIndex(allRows);
    const dataRows = allRows
        .slice(headerRowIndex + 1)
        .filter((row) => nonEmptyCount(row) > 0);
    const columns = buildColumns(allRows[headerRowIndex] || [], dataRows);

    return {
        fileName: file.name,
        fileType,
        sheetName,
        sourceSystem: detectSourceSystem(columns),
        headerRowIndex,
        columns,
        rows: dataRows,
        totalRows: dataRows.length,
        encoding: encodingResult?.encoding,
    };
};
