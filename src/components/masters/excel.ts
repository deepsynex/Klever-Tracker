"use client";

import type { SheetCell } from "@/lib/account-management/driver-sheet";

/**
 * .xlsx download and upload, done in the browser. The libraries load only when used, so they
 * don't weigh on the page. The first row is the header and is written in bold.
 */
export async function downloadSheet(rows: Array<Array<string | number>>, fileName: string): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const [header = [], ...body] = rows;
  const data = [header.map((value) => ({ value: String(value), fontWeight: "bold" as const })), ...body];
  await writeXlsxFile(data, { columns: header.map((h) => ({ width: Math.min(40, Math.max(12, String(h).length + 2)) })) }).toFile(fileName);
}

/** The first sheet of an uploaded .xlsx file, as rows of cells. */
export async function readSheetFile(file: File): Promise<SheetCell[][]> {
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(file)) as SheetCell[][];
}
