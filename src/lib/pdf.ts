import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * Render letter HTML to PDF. SERVER ONLY.
 *
 * On Vercel this uses the bundled headless Chromium; locally that binary is
 * Linux-only, so it falls back to the Chrome installed on the machine.
 */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const page = await browser.newPage();

    // The letter is entirely self-contained, so nothing should be fetched.
    // Block anything that tries, rather than letting a stray URL hang the render.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.isInterceptResolutionHandled()) return;
      if (req.url().startsWith("data:") || req.resourceType() === "document") {
        void req.continue();
      } else {
        void req.abort();
      }
    });

    await page.setContent(html, { waitUntil: "load", timeout: 20000 });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

async function launch(): Promise<Browser> {
  // @sparticuz/chromium ships a Linux binary; anywhere else, use local Chrome.
  if (process.platform === "linux") {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const local = process.env.CHROME_PATH;
  return puppeteer.launch({
    ...(local ? { executablePath: local } : { channel: "chrome" }),
    headless: true,
  });
}

export function pdfFileName(jobName: string): string {
  const base = (jobName || "award").trim().replace(/[^\w.-]+/g, "-");
  return `${base} - Adjudicacion de Subcontrato.pdf`;
}
