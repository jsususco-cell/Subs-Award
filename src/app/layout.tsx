import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Brand from "@/components/Brand";
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
    "Upload a raw scope export, extract the Demo/Site scope, and calculate the subcontractor award.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="no-print border-b-4 border-brand-red bg-navy-700">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
            <Brand />
            <div className="text-right">
              <h1 className="text-sm leading-tight font-semibold text-white">
                Subcontractor Award System
              </h1>
              <p className="text-xs text-navy-200">Scope extraction &amp; award</p>
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
