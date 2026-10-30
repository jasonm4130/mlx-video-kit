import assert from "node:assert/strict";

// The rows of the first markdown table whose header starts with
// `| <firstHeader> |`, each as an object keyed by the header cells.
export function markdownTable(markdown, firstHeader) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`| ${firstHeader} |`));
  assert.notEqual(start, -1, `no table with the header "${firstHeader}"`);
  const cells = (line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim().replaceAll("`", ""));
  const header = cells(lines[start]);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(Object.fromEntries(cells(line).map((cell, i) => [header[i], cell])));
  }
  return rows;
}
