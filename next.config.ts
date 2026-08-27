import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer-core and @sparticuz/chromium are opted out by Next already;
  // nodemailer is not, and its dynamic requires do not survive bundling.
  serverExternalPackages: ["nodemailer"],

  // Externalising @sparticuz/chromium keeps its code out of the bundle, but
  // file tracing still misses its compressed browser binaries, so the routes
  // fail on Vercel with "input directory .../bin does not exist". These are
  // data files no import points at, so they have to be named explicitly.
  outputFileTracingIncludes: {
    "/api/letter/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/letter/send": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
