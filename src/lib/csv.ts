/**
 * A small RFC 4180 CSV parser for the Phase 0 exports (Google Forms and
 * Sheets): quoted fields, doubled quotes, commas and newlines inside quotes,
 * CRLF line endings and a leading byte-order mark.
 */

/** Parses CSV text into rows of fields. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV ends inside a quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines are not records.
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

/**
 * Parses CSV with a header row into objects keyed by header (trimmed and
 * lowercased). Checks that every `required` column is present.
 */
export function parseCsv(text: string, required: readonly string[] = []): Record<string, string>[] {
  const [header, ...records] = parseCsvRows(text);
  if (!header) return [];
  const keys = header.map((name) => name.trim().toLowerCase());
  const missing = required.filter((name) => !keys.includes(name));
  if (missing.length) throw new Error(`CSV is missing column(s): ${missing.join(", ")}`);
  return records.map((values) =>
    Object.fromEntries(keys.map((key, i) => [key, (values[i] ?? "").trim()])),
  );
}
