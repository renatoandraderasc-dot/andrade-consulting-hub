import * as XLSX from "xlsx";
export function exportDemoRows(title: string, columns: string[], rows: (string | number)[][]) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[title], ["Supermercado Aurora · Dados fictícios"], [], columns, ...rows]);
  sheet["!cols"] = columns.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(book, sheet, "Demonstração");
  XLSX.writeFile(book, `${title.replace(/[^\p{L}\p{N}]+/gu, "-")}-demonstracao.xlsx`);
}