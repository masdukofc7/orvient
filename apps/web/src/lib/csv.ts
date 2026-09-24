/** Trigger a CSV file download in the browser. */
export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const escape = (cell: string | number | null | undefined) => {
    const raw = cell == null ? '' : String(cell);
    if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
    return raw;
  };
  const body = rows.map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
