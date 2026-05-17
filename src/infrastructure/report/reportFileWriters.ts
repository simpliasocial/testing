import * as xlsx from "xlsx";
import type { ReportSection } from "../../domain/report";
import {
    formatReportDateTime,
    normalizeCell,
    REPORT_TIME_ZONE,
    safeSheetName,
} from "../../shared/report/reportFormatting";
import { applyPlainHeaderStyle } from "./excelSheetStyles";

const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

const csvEscape = (value: unknown) => {
    const text = normalizeCell(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

const getSectionColumns = (section: ReportSection) =>
    Array.from(new Set(section.rows.flatMap((row) => Object.keys(row))));

const sectionToCsv = (section: ReportSection) => {
    const columns = getSectionColumns(section);
    const lines = [
        [csvEscape("Seccion"), csvEscape(section.title)].join(","),
        [csvEscape("Tipo"), csvEscape(section.kind || "datos")].join(","),
        [csvEscape("Descripcion"), csvEscape(section.description || "")].join(","),
        columns.map(csvEscape).join(","),
        ...section.rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
    ];
    return lines.join("\n");
};

export const exportCsvSections = (sections: ReportSection[], fileName: string) => {
    const csv = sections.map(sectionToCsv).join("\n\n");
    downloadBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), fileName);
};

const getColumnWidths = (rows: Array<Record<string, unknown>>, columns: string[]) =>
    columns.map((column) => {
        const maxContentLength = rows.reduce((max, row) => Math.max(max, normalizeCell(row[column]).length), column.length);
        return { wch: Math.min(48, Math.max(14, maxContentLength + 2)) };
    });

const getUniqueSheetName = (name: string, usedNames: Set<string>) => {
    const base = safeSheetName(name).slice(0, 31);
    if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
    }

    let index = 2;
    while (true) {
        const suffix = ` ${index}`;
        const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
        index += 1;
    }
};

export const exportExcelSections = (sections: ReportSection[], fileName: string) => {
    const workbook = xlsx.utils.book_new();
    const usedNames = new Set<string>();
    sections.forEach((section, index) => {
        const columns = getSectionColumns(section);
        const worksheet = xlsx.utils.json_to_sheet(section.rows, { header: columns });
        if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
        worksheet["!cols"] = getColumnWidths(section.rows, columns);
        applyPlainHeaderStyle(worksheet);
        xlsx.utils.book_append_sheet(workbook, worksheet, getUniqueSheetName(section.sheetName || `${index + 1} ${section.title}`, usedNames));
    });
    xlsx.writeFile(workbook, fileName);
};

const PDF_WIDTH = 595;
const PDF_HEIGHT = 842;
const PDF_MARGIN = 42;

const pdfRgb = {
    blue: "0.055 0.157 0.471",
    blue2: "0.098 0.259 0.627",
    lightBlue: "0.925 0.953 1",
    border: "0.82 0.86 0.92",
    text: "0.05 0.10 0.22",
    muted: "0.36 0.42 0.52",
    white: "1 1 1",
    row: "0.965 0.975 0.99",
};

const removePdfControlChars = (value: string) => Array.from(value)
    .map((char) => {
        const code = char.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13 ? " " : char;
    })
    .join("");

const toPdfLineText = (value: unknown) => removePdfControlChars(normalizeCell(value))
    .replace(/\s+/g, " ")
    .trim();

const toWinAnsiText = (value: unknown) => toPdfLineText(value)
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pdfText = (value: unknown) => {
    const text = toWinAnsiText(value).slice(0, 1600);
    return `(${text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
};

const wrapText = (value: unknown, maxChars: number) => {
    const text = toWinAnsiText(value);
    if (text.length <= maxChars) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxChars) {
        const splitAt = remaining.lastIndexOf(" ", maxChars);
        const index = splitAt > 16 ? splitAt : maxChars;
        chunks.push(remaining.slice(0, index));
        remaining = remaining.slice(index).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
};

const charsForWidth = (width: number, size: number) => Math.max(12, Math.floor(width / (size * 0.52)));

const winAnsiBytes = (value: string) => {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
        bytes[index] = value.charCodeAt(index) & 0xff;
    }
    return bytes;
};

const buildPdfBlob = (title: string, sections: ReportSection[]) => {
    const pages: string[][] = [];
    let ops: string[] = [];
    let y = 0;
    let pageNumber = 0;

    const addOp = (value: string) => ops.push(value);
    const rect = (x: number, bottom: number, width: number, height: number, fillColor?: string, strokeColor?: string) => {
        if (fillColor) addOp(`${fillColor} rg ${x} ${bottom} ${width} ${height} re f`);
        if (strokeColor) addOp(`${strokeColor} RG ${x} ${bottom} ${width} ${height} re S`);
    };
    const textLine = (text: unknown, x: number, baseline: number, size = 9, font = "F1", color = pdfRgb.text) => {
        addOp(`${color} rg BT /${font} ${size} Tf ${x} ${baseline} Td ${pdfText(text)} Tj ET`);
    };
    const finishPage = () => {
        if (ops.length > 0) pages.push(ops);
    };
    const footer = () => {
        textLine(`Página ${pageNumber}`, PDF_WIDTH - PDF_MARGIN - 52, 22, 8, "F1", pdfRgb.muted);
        textLine("SIMPLIA Control Comercial", PDF_MARGIN, 22, 8, "F1", pdfRgb.muted);
    };
    const header = () => {
        pageNumber += 1;
        ops = [];
        y = 760;
        rect(0, 792, PDF_WIDTH, 50, pdfRgb.blue);
        textLine("SIMPLIA", PDF_MARGIN, 813, 22, "F2", pdfRgb.white);
        textLine("CONTROL COMERCIAL", PDF_MARGIN, 801, 7, "F1", pdfRgb.white);
        textLine(REPORT_TIME_ZONE, PDF_WIDTH - PDF_MARGIN - 150, 812, 8, "F1", pdfRgb.white);
        footer();
    };
    const newPage = () => {
        if (ops.length > 0) finishPage();
        header();
    };
    const ensure = (height: number) => {
        if (y - height < 55) newPage();
    };
    const textBlock = (text: unknown, x = PDF_MARGIN, size = 9, font = "F1", color = pdfRgb.text, maxWidth = PDF_WIDTH - PDF_MARGIN * 2, lineHeight = Math.ceil(size * 1.35)) => {
        const lines = wrapText(text, charsForWidth(maxWidth, size));
        lines.forEach((line) => {
            ensure(lineHeight + 4);
            textLine(line, x, y, size, font, color);
            y -= lineHeight;
        });
        y -= 2;
    };
    const heading = (value: unknown) => {
        ensure(32);
        textBlock(value, PDF_MARGIN, 13, "F2", pdfRgb.blue, PDF_WIDTH - PDF_MARGIN * 2, 16);
        rect(PDF_MARGIN, y + 8, PDF_WIDTH - PDF_MARGIN * 2, 0.5, pdfRgb.border);
        y -= 8;
    };
    const paragraph = (value: unknown) => {
        textBlock(value, PDF_MARGIN, 9, "F1", pdfRgb.text, PDF_WIDTH - PDF_MARGIN * 2, 13);
    };
    const kpiCards = (section: ReportSection | undefined) => {
        const rows = (section?.rows || []).slice(0, 4);
        if (rows.length === 0) return;
        const width = (PDF_WIDTH - PDF_MARGIN * 2 - 24) / 4;
        ensure(64);
        rows.forEach((row, index) => {
            const keys = Object.keys(row);
            const label = normalizeCell(row.Métrica ?? row.Metrica ?? row.KPI ?? row.Campo ?? keys[0] ?? "Métrica");
            const value = normalizeCell(row.Valor ?? row.Resultado ?? row.Total ?? row[keys[1]] ?? "");
            const x = PDF_MARGIN + index * (width + 8);
            rect(x, y - 54, width, 48, pdfRgb.lightBlue, pdfRgb.border);
            textLine(label, x + 9, y - 21, 7, "F1", pdfRgb.muted);
            wrapText(value, charsForWidth(width - 18, 13)).slice(0, 2).forEach((line, lineIndex) => {
                textLine(line, x + 9, y - 39 - lineIndex * 14, 13, "F2", pdfRgb.blue);
            });
        });
        y -= 76;
    };
    const tableAsCards = (sectionTitle: string, columns: string[], rows: Record<string, unknown>[]) => {
        const width = PDF_WIDTH - PDF_MARGIN * 2;
        if (rows.length === 0) {
            paragraph("No hay filas para esta sección con los filtros actuales.");
            return;
        }
        textLine(sectionTitle, PDF_MARGIN, y, 11, "F2", pdfRgb.text);
        y -= 16;
        rows.forEach((row, rowIndex) => {
            const firstColumn = columns[0] || "Elemento";
            const titleLine = `${firstColumn}: ${normalizeCell(row[firstColumn]) || "Sin dato"}`;
            const fields = columns.slice(1).map((column) => `${column}: ${normalizeCell(row[column]) || "Sin dato"}`);
            const titleLines = wrapText(titleLine, charsForWidth(width - 24, 9));
            const fieldLines = fields.flatMap((field) => wrapText(field, charsForWidth(width - 24, 8)));
            const cardHeight = 20 + titleLines.length * 12 + fieldLines.length * 10;
            if (cardHeight > 620) {
                textBlock(titleLine, PDF_MARGIN + 4, 9, "F2", pdfRgb.blue, width - 8, 12);
                fields.forEach((field) => textBlock(field, PDF_MARGIN + 10, 8, "F1", pdfRgb.text, width - 18, 10));
                y -= 4;
                return;
            }
            ensure(cardHeight + 8);
            rect(PDF_MARGIN, y - cardHeight + 8, width, cardHeight, rowIndex % 2 === 0 ? pdfRgb.row : "0.99 0.995 1", pdfRgb.border);
            y -= 10;
            titleLines.forEach((line) => {
                textLine(line, PDF_MARGIN + 10, y, 9, "F2", pdfRgb.blue);
                y -= 12;
            });
            fieldLines.forEach((line) => {
                textLine(line, PDF_MARGIN + 10, y, 8, "F1", pdfRgb.text);
                y -= 10;
            });
            y -= 8;
        });
        y -= 6;
    };
    const table = (sectionTitle: string, columns: string[], rows: Record<string, unknown>[]) => {
        const shouldUseCards = columns.length >= 4 || rows.some((row) => columns.some((column) => toWinAnsiText(row[column]).length > 42));
        if (shouldUseCards) {
            tableAsCards(sectionTitle, columns, rows);
            return;
        }
        const width = PDF_WIDTH - PDF_MARGIN * 2;
        const colWidth = width / Math.max(1, columns.length);
        textLine(sectionTitle, PDF_MARGIN, y, 11, "F2", pdfRgb.text);
        y -= 16;
        const headerLines = columns.map((column) => wrapText(column, charsForWidth(colWidth - 10, 7)));
        const headerHeight = Math.max(18, Math.max(...headerLines.map((lines) => lines.length)) * 9 + 9);
        ensure(headerHeight + 8);
        rect(PDF_MARGIN, y - headerHeight + 5, width, headerHeight, pdfRgb.blue2);
        headerLines.forEach((lines, index) => {
            lines.forEach((line, lineIndex) => textLine(line, PDF_MARGIN + index * colWidth + 5, y - 8 - lineIndex * 9, 7, "F2", pdfRgb.white));
        });
        y -= headerHeight;
        rows.forEach((row, rowIndex) => {
            const cellLines = columns.map((column) => wrapText(row[column] || "", charsForWidth(colWidth - 10, 7)));
            const rowHeight = Math.max(18, Math.max(...cellLines.map((lines) => lines.length)) * 9 + 9);
            ensure(rowHeight + 4);
            if (rowIndex % 2 === 0) rect(PDF_MARGIN, y - rowHeight + 5, width, rowHeight, pdfRgb.row);
            rect(PDF_MARGIN, y - rowHeight + 5, width, rowHeight, undefined, pdfRgb.border);
            cellLines.forEach((lines, index) => {
                lines.forEach((line, lineIndex) => textLine(line, PDF_MARGIN + index * colWidth + 5, y - 8 - lineIndex * 9, 7, "F1", pdfRgb.text));
            });
            y -= rowHeight;
        });
        y -= 6;
    };

    header();
    textBlock(title, PDF_MARGIN, 18, "F2", pdfRgb.blue, PDF_WIDTH - PDF_MARGIN * 2, 22);
    textLine(`Generado: ${formatReportDateTime()}`, PDF_MARGIN, y, 8, "F1", pdfRgb.muted);
    y -= 18;
    kpiCards(sections.find((section) => section.kind === "kpi"));

    sections.forEach((section) => {
        heading(section.title);
        if (section.description) paragraph(section.description);
        const columns = getSectionColumns(section);
        if (columns.length > 0) table(section.sheetName || section.title, columns, section.rows);
        y -= 4;
    });
    finishPage();

    const objects: string[] = [];
    const addObject = (body: string) => {
        objects.push(body);
        return objects.length;
    };
    const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesId = addObject("__PAGES__");
    const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds: number[] = [];

    pages.forEach((pageOps) => {
        const stream = pageOps.join("\n");
        const contentId = addObject(`<< /Length ${winAnsiBytes(stream).length} >>\nstream\n${stream}\nendstream`);
        const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        pageIds.push(pageId);
    });

    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((body, index) => {
        offsets.push(winAnsiBytes(pdf).length);
        pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefOffset = winAnsiBytes(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([winAnsiBytes(pdf)], { type: "application/pdf" });
};

export const exportPdfSections = (title: string, sections: ReportSection[], fileName: string) => {
    downloadBlob(buildPdfBlob(title, sections), fileName);
};
