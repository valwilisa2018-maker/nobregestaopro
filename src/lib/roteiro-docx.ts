/**
 * Converte um roteiro salvo em HTML para um documento Word (.docx),
 * compatível com Word e Google Documentos.
 * Só roda no navegador (usa DOMParser).
 */
export async function roteiroHtmlToDocxBlob(html: string, title?: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");

  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const blocks = Array.from(
    doc.body.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,div,pre"),
  ).filter((el) => !el.querySelector("h1,h2,h3,h4,p,li,blockquote,div,pre"));

  const source: Element[] = blocks.length ? blocks : [];
  const paragraphs: InstanceType<typeof Paragraph>[] = [];

  if (title) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: title, bold: true, size: 32 })],
      }),
    );
  }

  const push = (text: string, tag: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const heading =
      tag === "h1"
        ? HeadingLevel.HEADING_1
        : tag === "h2"
          ? HeadingLevel.HEADING_2
          : tag === "h3" || tag === "h4"
            ? HeadingLevel.HEADING_3
            : undefined;
    paragraphs.push(
      new Paragraph({
        ...(heading ? { heading } : {}),
        ...(tag === "li" ? { bullet: { level: 0 } } : {}),
        spacing: { after: 120, line: 320 },
        children: [new TextRun({ text: clean, size: 24 })],
      }),
    );
  };

  if (source.length) {
    for (const el of source) push(el.textContent ?? "", el.tagName.toLowerCase());
  } else {
    const plain = doc.body.textContent ?? "";
    for (const line of plain.split(/\n{1,}/)) push(line, "p");
  }

  if (paragraphs.length === 0) paragraphs.push(new Paragraph({ children: [new TextRun("")] }));

  const document = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return Packer.toBlob(document);
}

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
