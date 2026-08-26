import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Subcontractor Award System",
  description:
    "Upload a scope of work and get the Demo/Site, less O&P, percentage tier and award totals calculated automatically.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="no-print bg-navy-700">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3.5 sm:px-6">
            <span aria-hidden className="h-6 w-1 rounded-full bg-brand-red" />
            <div>
              <h1 className="text-base leading-tight font-semibold text-white">
                Subcontractor Award System
              </h1>
              <p className="text-xs text-navy-200">Byrdson Services</p>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="no-print border-t border-navy-100 py-4">
          <p className="mx-auto w-full max-w-7xl px-4 text-xs text-navy-600/60 sm:px-6">
            Scope files are parsed in your browser. Nothing is uploaded or stored on a
            server.
          </p>
        </footer>
      </body>
    </html>
  );
}
