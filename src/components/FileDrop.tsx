"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  busy: boolean;
  fileName: string | null;
}

const ACCEPT = ".xls,.xlsx,.xlsm,.xlsb,.csv";

export default function FileDrop({ onFile, busy, fileName }: Props) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload a scope of work file"
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40 ${
        over
          ? "border-navy-600 bg-navy-50"
          : "border-navy-200 bg-white hover:border-navy-300 hover:bg-navy-50/50"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="mb-3 h-9 w-9 text-navy-600"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
        <path d="M3.5 15v3A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5v-3" />
      </svg>
      <p className="text-sm font-semibold text-navy-800">
        {busy
          ? "Reading workbook…"
          : fileName
            ? "Drop another file to replace"
            : "Drop the scope of work here, or click to browse"}
      </p>
      <p className="mt-1 text-xs text-navy-600/70">
        {fileName ?? "Accepts .xls, .xlsx, .xlsm, .xlsb and .csv"}
      </p>
      <p className="mt-3 text-[11px] text-navy-600/60">
        The file is read in your browser. Nothing is uploaded to a server.
      </p>
    </div>
  );
}
