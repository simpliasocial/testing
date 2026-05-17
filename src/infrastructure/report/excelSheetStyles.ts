import * as xlsx from "xlsx";

const PLAIN_HEADER_STYLE = {
    font: { bold: true, color: { rgb: "000000" } },
    alignment: { vertical: "center", wrapText: true },
};

export const applyPlainHeaderStyle = (worksheet: xlsx.WorkSheet) => {
    if (!worksheet["!ref"]) return worksheet;

    const range = xlsx.utils.decode_range(worksheet["!ref"]);
    for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cellRef = xlsx.utils.encode_cell({ r: range.s.r, c: column });
        const cell = worksheet[cellRef];
        if (cell) cell.s = PLAIN_HEADER_STYLE;
    }

    worksheet["!rows"] = worksheet["!rows"] || [];
    worksheet["!rows"][range.s.r] = {
        ...(worksheet["!rows"][range.s.r] || {}),
        hpt: 18,
    };

    return worksheet;
};
