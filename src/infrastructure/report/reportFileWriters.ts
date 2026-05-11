import * as xlsx from "xlsx";
import type { ReportSection } from "../../domain/report";
import {
    formatReportDateTime,
    normalizeCell,
    REPORT_TIME_ZONE,
    safeSheetName,
} from "../../shared/report/reportFormatting";

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
        xlsx.utils.book_append_sheet(workbook, worksheet, getUniqueSheetName(section.sheetName || `${index + 1} ${section.title}`, usedNames));
    });
    xlsx.writeFile(workbook, fileName);
};

const toPdfSafeText = (value: unknown) => normalizeCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const wrapLine = (line: string, maxLength = 96) => {
    const clean = toPdfSafeText(line);
    if (clean.length <= maxLength) return [clean];

    const chunks: string[] = [];
    let remaining = clean;
    while (remaining.length > maxLength) {
        const splitIndex = remaining.lastIndexOf(" ", maxLength);
        const index = splitIndex > 20 ? splitIndex : maxLength;
        chunks.push(remaining.slice(0, index));
        remaining = remaining.slice(index).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
};

const pdfEscape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const sectionsToPdfLines = (title: string, sections: ReportSection[]) => {
    const lines = [
        title,
        "Reporte ejecutivo del dashboard",
        `Generado: ${formatReportDateTime()}`,
        `Zona horaria: ${REPORT_TIME_ZONE}`,
        "Nota: el PDF prioriza lectura ejecutiva. El detalle completo y filtrable vive en Excel/CSV.",
        "",
    ];

    sections.forEach((section) => {
        lines.push(section.title);
        if (section.description) lines.push(section.description);
        const columns = getSectionColumns(section).slice(0, section.kind === "detail" ? 8 : 10);
        const rowLimit = section.kind === "detail" ? 40 : 120;
        if (columns.length > 0) lines.push(columns.join(" | "));
        section.rows.slice(0, rowLimit).forEach((row) => {
            lines.push(columns.map((column) => normalizeCell(row[column])).join(" | "));
        });
        if (section.rows.length > rowLimit) lines.push(`... ${section.rows.length - rowLimit} filas adicionales en Excel/CSV`);
        lines.push("");
    });

    return lines.flatMap((line) => wrapLine(line));
};

const buildPdfBlob = (lines: string[]) => {
    const pageLines: string[][] = [];
    const linesPerPage = 48;
    for (let index = 0; index < lines.length; index += linesPerPage) {
        pageLines.push(lines.slice(index, index + linesPerPage));
    }

    const objects: string[] = [];
    const addObject = (body: string) => {
        objects.push(body);
        return objects.length;
    };

    const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesPlaceholderId = addObject("__PAGES__");
    const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIds: number[] = [];

    pageLines.forEach((page) => {
        const streamLines = ["BT", "/F1 9 Tf", "40 800 Td"];
        page.forEach((line, index) => {
            if (index > 0) streamLines.push("0 -14 Td");
            streamLines.push(`(${pdfEscape(line)}) Tj`);
        });
        streamLines.push("ET");
        const stream = streamLines.join("\n");
        const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        const pageId = addObject(`<< /Type /Page /Parent ${pagesPlaceholderId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        pageIds.push(pageId);
    });

    objects[pagesPlaceholderId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((body, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: "application/pdf" });
};

export const exportPdfSections = (title: string, sections: ReportSection[], fileName: string) => {
    const lines = sectionsToPdfLines(title, sections);
    downloadBlob(buildPdfBlob(lines), fileName);
};
