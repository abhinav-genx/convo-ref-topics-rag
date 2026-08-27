import { createWorker, type Worker } from "tesseract.js";
import { pdf } from "pdf-to-img";

const MAX_PDF_PAGES = 20;
const PDF_SCALE = 2;

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

function withWorker<T>(fn: (worker: Worker) => Promise<T>): Promise<T> {
  const run = queue.then(async () => fn(await getWorker()));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ocrImage(image: Buffer | string): Promise<string> {
  return withWorker(async (worker) => {
    const { data } = await worker.recognize(image);
    return data.text.trim();
  });
}

async function ocrPdf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const document = await pdf(buffer, { scale: PDF_SCALE });
  const pageTexts: string[] = [];
  let page = 0;

  for await (const image of document) {
    page += 1;
    if (page > MAX_PDF_PAGES) {
      pageTexts.push(
        `\n[OCR stopped after ${MAX_PDF_PAGES} pages to keep the request bounded.]`,
      );
      break;
    }
    const text = await ocrImage(image);
    pageTexts.push(text ? `--- Page ${page} ---\n${text}` : `--- Page ${page} ---\n`);
  }

  return {
    text: pageTexts.join("\n\n").trim(),
    pages: Math.min(page, MAX_PDF_PAGES),
  };
}

export function isPdfFile(mimetype: string, originalname: string): boolean {
  return mimetype === "application/pdf" || originalname.toLowerCase().endsWith(".pdf");
}

export async function extractText(
  buffer: Buffer,
): Promise<{ text: string; pages: number; method: "ocr" }> {
  const result = await ocrPdf(buffer);
  return { ...result, method: "ocr" };
}
