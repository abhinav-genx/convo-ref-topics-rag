import { extractText as extractPdfjsText } from "unpdf";

export function isPdfFile(mimetype: string, originalname: string): boolean {
  return mimetype === "application/pdf" || originalname.toLowerCase().endsWith(".pdf");
}

export async function extractPdfText(
  buffer: Buffer,
): Promise<{ text: string; pages: number; method: "pdf-text" }> {
  const { text, totalPages } = await extractPdfjsText(new Uint8Array(buffer), {
    mergePages: false,
  });
  const pages = Array.isArray(text) ? text : [text];
  const labeled = pages.map((page, i) => {
    const line = String(page ?? "")
      .replace(/\s+/g, " ")
      .trim();
    return line ? `--- Page ${i + 1} ---\n${line}` : `--- Page ${i + 1} ---`;
  });

  return {
    text: labeled.join("\n\n").trim(),
    pages: totalPages,
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
