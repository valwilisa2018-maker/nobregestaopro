/**
 * Teste automatizado: valida que a IA extrai os dados principais
 * de um PDF de comprovante enviado via Lovable AI Gateway (multimodal).
 *
 * Uso: bun run scripts/test-receipt-extraction.ts
 * Requer: LOVABLE_API_KEY no ambiente.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

const FIXTURE = {
  bank: "Banco Lovable",
  payer: "Willian Souza",
  payee: "Fornecedor XYZ LTDA",
  amount: "R$ 1.234,56",
  date: "04/07/2026",
  transactionId: "E18236120202607041030ABC123",
};

async function buildReceiptPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 560]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines: Array<[string, string]> = [
    ["COMPROVANTE DE PAGAMENTO PIX", ""],
    ["Banco:", FIXTURE.bank],
    ["Pagador:", FIXTURE.payer],
    ["Beneficiario:", FIXTURE.payee],
    ["Valor:", FIXTURE.amount],
    ["Data:", FIXTURE.date],
    ["ID da transacao:", FIXTURE.transactionId],
  ];
  let y = 500;
  for (const [label, value] of lines) {
    page.drawText(label, { x: 40, y, size: 14, font: bold });
    if (value) page.drawText(value, { x: 180, y, size: 14, font });
    y -= 32;
  }
  return pdf.save();
}

async function extractWithAi(pdfBytes: Uint8Array) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const b64 = Buffer.from(pdfBytes).toString("base64");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "Voce extrai dados de comprovantes bancarios. Responda APENAS com JSON valido, sem markdown." },
        { role: "user", content: [
          { type: "text", text: "Extraia deste comprovante: bank, payer, payee, amount, date, transactionId. Devolva JSON puro." },
          { type: "file", file: { filename: "comprovante.pdf", file_data: `data:application/pdf;base64,${b64}` } },
        ] },
      ],
    }),
  });
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
  if (!res.ok) throw new Error(`Gateway ${res.status}: ${JSON.stringify(json)}`);
  const raw = json.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error(`Resposta sem JSON: ${raw}`);
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, string>;
}

function norm(s: string) { return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

async function main() {
  console.log("→ Gerando PDF de comprovante...");
  const pdfBytes = await buildReceiptPdf();
  console.log(`  PDF: ${pdfBytes.length} bytes`);
  console.log("→ Enviando para a IA...");
  const extracted = await extractWithAi(pdfBytes);
  console.log("  Extraído:", extracted);

  const checks: Array<[string, boolean, string]> = [
    ["bank", norm(extracted.bank ?? "").includes(norm(FIXTURE.bank)), FIXTURE.bank],
    ["payer", norm(extracted.payer ?? "").includes(norm(FIXTURE.payer)), FIXTURE.payer],
    ["payee", norm(extracted.payee ?? "").includes(norm("Fornecedor XYZ")), FIXTURE.payee],
    ["amount", /1[.,]?234[.,]56/.test(extracted.amount ?? ""), FIXTURE.amount],
    ["date", (extracted.date ?? "").includes("04") && (extracted.date ?? "").includes("2026"), FIXTURE.date],
    ["transactionId", norm(extracted.transactionId ?? "") === norm(FIXTURE.transactionId), FIXTURE.transactionId],
  ];

  let ok = true;
  for (const [field, pass, expected] of checks) {
    console.log(`  ${pass ? "✅" : "❌"} ${field} (esperado ~ ${expected}, recebido: ${extracted[field] ?? "∅"})`);
    if (!pass) ok = false;
  }
  if (!ok) { console.error("\n❌ Teste FALHOU"); process.exit(1); }
  console.log("\n✅ Teste PASSOU — IA extraiu os dados principais do comprovante.");
}

main().catch((e) => { console.error(e); process.exit(1); });