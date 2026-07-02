import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ContactRow = { name: string | null; phone: string; status?: string; notes?: string | null };

const HEADERS = ["nome", "telefone", "status", "notas"];

export function downloadTemplateXLSX() {
  const ws = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ["João Silva", "5511999998888", "active", "Cliente VIP"],
    ["Maria Souza", "5511988887777", "active", ""],
  ]);
  ws["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contatos");
  XLSX.writeFile(wb, "modelo-contatos.xlsx");
}

export function downloadTemplateCSV() {
  const csv = HEADERS.join(",") + "\n" + "João Silva,5511999998888,active,Cliente VIP\nMaria Souza,5511988887777,active,\n";
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), "modelo-contatos.csv");
}

export async function parseContactsFile(file: File): Promise<ContactRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return rows.map((r) => {
    const get = (keys: string[]) => {
      for (const k of Object.keys(r)) if (keys.includes(k.toLowerCase().trim())) return String(r[k] ?? "").trim();
      return "";
    };
    const phone = get(["telefone", "phone", "numero", "número", "celular", "whatsapp"]).replace(/\D/g, "");
    const name = get(["nome", "name", "contato"]) || null;
    const statusRaw = get(["status"]).toLowerCase();
    const status = ["active", "blocked", "archived"].includes(statusRaw) ? statusRaw : "active";
    const notes = get(["notas", "notes", "observacao", "observação"]) || null;
    return { name, phone, status, notes };
  }).filter((r) => r.phone.length >= 8);
}

export function exportContactsXLSX(rows: ContactRow[]) {
  const data = [HEADERS, ...rows.map((r) => [r.name ?? "", r.phone, r.status ?? "active", r.notes ?? ""])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contatos");
  XLSX.writeFile(wb, `contatos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportContactsCSV(rows: ContactRow[]) {
  const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = [HEADERS.join(","), ...rows.map((r) => [r.name ?? "", r.phone, r.status ?? "active", r.notes ?? ""].map((c) => esc(String(c))).join(","))].join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `contatos-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportContactsPDF(rows: ContactRow[]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Lista de Contatos", 14, 15);
  doc.setFontSize(10);
  doc.text(`Total: ${rows.length} • Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
  autoTable(doc, {
    startY: 28,
    head: [["Nome", "Telefone", "Status", "Notas"]],
    body: rows.map((r) => [r.name ?? "-", r.phone, r.status ?? "active", r.notes ?? ""]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  doc.save(`contatos-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}