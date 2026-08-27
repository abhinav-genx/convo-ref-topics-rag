export function isPdfFile(mimetype: string, originalname: string): boolean {
  return mimetype === "application/pdf" || originalname.toLowerCase().endsWith(".pdf");
}

type PdfTextItem = { str?: string };

export async function extractPdfText(
  buffer: Buffer,
): Promise<{ text: string; pages: number; method: "pdf-text" }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? String((item as PdfTextItem).str ?? "") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(line ? `--- Page ${i} ---\n${line}` : `--- Page ${i} ---`);
  }

  return {
    text: pages.join("\n\n").trim(),
    pages: doc.numPages,
    method: "pdf-text",
  };
}

export async function extractText(
  buffer: Buffer,
): Promise<{ text: string; pages: number; method: "pdf-text" | "ocr" }> {
  const digital = await extractPdfText(buffer);
  if (process.env.VERCEL) {
    return digital;
  }
  const dense = digital.text.replace(/\s/g, "").length;
  if (dense >= 80) {
    return digital;
  }
  const ocr = await import("./ocr.js");
  return ocr.extractText(buffer);
}
