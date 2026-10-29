/**
 * Driver Excel import/export (pure part): the sheet's columns and turning uploaded rows into
 * createDriver variables. Reading and writing the .xlsx file itself happens in the browser
 * (components/masters/excel.ts), so this stays unit-testable.
 */
import { isValidPhone, type Errors } from "@/lib/vehicle-management/validation";
import type { AmDriver } from "@/lib/graphql/account-management";
import { EMPLOYMENT_TYPES } from "./forms";

/** One sheet column: its header (English, as in the sample file) and the driver field it fills. */
type SheetColumn = {
  key: keyof AmDriver;
  header: string;
  kind: "text" | "date" | "number" | "yesno";
  required?: boolean;
};

export const DRIVER_SHEET_COLUMNS: SheetColumn[] = [
  { key: "name", header: "Name", kind: "text", required: true },
  { key: "mobile", header: "Mobile Number", kind: "text", required: true },
  { key: "employeeId", header: "Employee Id", kind: "text" },
  { key: "nationality", header: "Nationality", kind: "text" },
  { key: "address", header: "Address", kind: "text" },
  { key: "licenceNo", header: "License Number", kind: "text" },
  { key: "licenceExpiryDate", header: "License Expiry Date (YYYY-MM-DD)", kind: "date" },
  { key: "visaExpiryDate", header: "Visa Expiry Date (YYYY-MM-DD)", kind: "date" },
  { key: "employmentType", header: "Employment Type (Permanent/Temporary)", kind: "text" },
  { key: "canDriveHeavy", header: "Heavy Vehicle (Yes/No)", kind: "yesno" },
  { key: "canDriveLight", header: "Light Vehicle (Yes/No)", kind: "yesno" },
  { key: "workingHoursPerDay", header: "Working Hours", kind: "number" },
  { key: "overtimeRate", header: "Overtime Charges", kind: "number" },
  { key: "rfidTagId", header: "Tag Id", kind: "text" },
  { key: "emergencyContactName", header: "Emergency Contact Name", kind: "text" },
  { key: "emergencyContactNumber", header: "Emergency Contact Number", kind: "text" },
  { key: "bloodGroup", header: "Blood Group", kind: "text" },
  { key: "notes", header: "Notes", kind: "text" },
];

/** Header + one example row, for the "Sample Excel" download. */
export function driverSampleSheet(): Array<Array<string | number>> {
  const example: Record<string, string | number> = {
    name: "Ahmed Khan",
    mobile: "+971501234567",
    employeeId: "EMP-001",
    nationality: "Pakistan",
    licenceNo: "DXB-123456",
    licenceExpiryDate: "2027-12-31",
    employmentType: "Permanent",
    canDriveHeavy: "No",
    canDriveLight: "Yes",
    workingHoursPerDay: 8,
  };
  return [DRIVER_SHEET_COLUMNS.map((c) => c.header), DRIVER_SHEET_COLUMNS.map((c) => example[c.key] ?? "")];
}

/** The driver list as sheet rows (header first), for "Export". */
export function driverExportSheet(drivers: AmDriver[]): Array<Array<string | number>> {
  const cell = (d: AmDriver, c: SheetColumn): string | number => {
    const v = d[c.key];
    if (v === null || v === undefined) return "";
    if (c.kind === "yesno") return v ? "Yes" : "No";
    if (c.kind === "date") return String(v).slice(0, 10);
    if (c.key === "employmentType") return String(v).charAt(0).toUpperCase() + String(v).slice(1);
    return typeof v === "number" ? v : String(v);
  };
  return [DRIVER_SHEET_COLUMNS.map((c) => c.header), ...drivers.map((d) => DRIVER_SHEET_COLUMNS.map((c) => cell(d, c)))];
}

/** A spreadsheet cell as read from the file: text, number, boolean, Date, or empty. */
export type SheetCell = string | number | boolean | Date | null | undefined;

export type ParsedDriverRow = {
  /** 1-based row number in the sheet (the header is row 1). */
  rowNumber: number;
  name: string;
  variables: Record<string, unknown>;
  /** Field → translation key under `validation.*`. */
  errors: Errors;
};

const normalizeHeader = (h: unknown) =>
  String(h ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z]/g, "");

function dateText(cell: SheetCell): string | null {
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : cell.toISOString().slice(0, 10);
  const s = String(cell).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : [];
  if (!y) return null;
  const out = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  const check = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === out ? out : null;
}

/**
 * Uploaded sheet → one entry per non-empty row, with createDriver variables and any problems.
 * Columns are matched by header (case, spaces and the "(…)" hints ignored), so their order
 * doesn't matter. Returns null when the Name or Mobile Number column is missing.
 */
export function parseDriverSheet(rows: SheetCell[][]): ParsedDriverRow[] | null {
  const [header, ...body] = rows;
  if (!header) return null;
  const index = new Map(header.map((h, i) => [normalizeHeader(h), i]));
  const columns = DRIVER_SHEET_COLUMNS.map((c) => ({ ...c, at: index.get(normalizeHeader(c.header)) }));
  if (columns.some((c) => c.required && c.at === undefined)) return null;

  const parsed: ParsedDriverRow[] = [];
  body.forEach((row, i) => {
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) return;
    const variables: Record<string, unknown> = {};
    const errors: Errors = {};
    for (const c of columns) {
      const cell = c.at === undefined ? null : row[c.at];
      const blank = cell === null || cell === undefined || String(cell).trim() === "";
      if (blank) {
        if (c.required) errors[c.key] = "required";
        continue;
      }
      if (c.kind === "date") {
        const d = dateText(cell);
        if (d) variables[c.key] = d;
        else errors[c.key] = "date";
      } else if (c.kind === "number") {
        const n = typeof cell === "number" ? cell : Number(String(cell).trim());
        if (Number.isFinite(n) && n >= 0) variables[c.key] = n;
        else errors[c.key] = "nonNegative";
      } else if (c.kind === "yesno") {
        const s = String(cell).trim().toLowerCase();
        if (cell === true || ["yes", "y", "true", "1"].includes(s)) variables[c.key] = true;
        else if (cell === false || ["no", "n", "false", "0"].includes(s)) variables[c.key] = false;
        else errors[c.key] = "yesNo";
      } else {
        variables[c.key] = String(cell).trim();
      }
    }
    if (typeof variables.mobile === "string" && !isValidPhone(variables.mobile)) errors.mobile = "phone";
    if (typeof variables.emergencyContactNumber === "string" && !isValidPhone(variables.emergencyContactNumber)) {
      errors.emergencyContactNumber = "phone";
    }
    if (typeof variables.employmentType === "string") {
      const type = variables.employmentType.toLowerCase();
      if ((EMPLOYMENT_TYPES as readonly string[]).includes(type)) variables.employmentType = type;
      else {
        errors.employmentType = "employmentType";
        delete variables.employmentType;
      }
    }
    if (typeof variables.workingHoursPerDay === "number" && variables.workingHoursPerDay > 24) errors.workingHoursPerDay = "hoursPerDay";
    parsed.push({ rowNumber: i + 2, name: String(variables.name ?? ""), variables, errors });
  });
  return parsed;
}

/** Sheet header of a driver field, for "Row 4 – Mobile Number: …" messages. */
export function driverSheetHeader(key: string): string {
  return (DRIVER_SHEET_COLUMNS.find((c) => c.key === key)?.header ?? key).replace(/\s*\(.*\)$/, "");
}
