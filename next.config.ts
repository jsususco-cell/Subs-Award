import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer-core and @sparticuz/chromium are opted out by Next already;
  // nodemailer is not, and its dynamic requires do not survive bundling.
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
