"use client";

import { useState } from "react";
import { defaultBody, defaultSubject } from "@/lib/letter-email";
import type { LetterInput } from "@/lib/letter";

interface Props {
  letter: LetterInput;
  /** Prefilled from the subcontractor's Quickbase record, when there is one. */
  suggestedTo: string;
  ready: boolean;
}

type Stage = "compose" | "confirming" | "sending" | "sent";

const KEY_STORE = "subs-award:send-key";

function storedKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

export default function SendLetterPanel({ letter, suggestedTo, ready }: Props) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState<Stage>("compose");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[]>([]);
  // Only surfaced once the server says a key is required, so local use is
  // unaffected. Read lazily in the click handler, never during render.
  const [sendKey, setSendKey] = useState("");
  const [keyNeeded, setKeyNeeded] = useState(false);

  // The defaults follow the letter until the user edits a field.
  const effectiveTo = touched ? to : to || suggestedTo;
  const effectiveSubject = subject || defaultSubject(letter);
  const effectiveText = text || defaultBody(letter);

  const canSend = ready && effectiveTo.trim().length > 0 && stage !== "sending";

  async function send() {
    setStage("sending");
    setError(null);
    try {
      const key = sendKey || storedKey();
      const res = await fetch("/api/letter/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "x-send-key": key } : {}),
        },
        body: JSON.stringify({
          letter,
          to: effectiveTo,
          cc,
          subject: effectiveSubject,
          text: effectiveText,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        if (body.keyRequired) {
          setKeyNeeded(true);
          setError(
            "This deployment needs a send key before it will mail anything. Enter it below.",
          );
        } else {
          setError(body.error ?? "Could not send the letter.");
        }
        setStage("compose");
        return;
      }
      try {
        localStorage.setItem(KEY_STORE, key);
      } catch {
        /* private mode — the key just will not be remembered */
      }
      setSentTo([...(body.to ?? []), ...(body.cc ?? [])]);
      setStage("sent");
    } catch {
      setError("Could not reach the server. The letter was not sent.");
      setStage("compose");
    }
  }

  if (stage === "sent") {
    return (
      <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        <header className="border-b-2 border-brand-red bg-navy-700 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
            Letter sent
          </h2>
        </header>
        <div className="p-4">
          <p className="text-sm text-navy-800">
            The award letter was sent to{" "}
            <strong>{sentTo.join(", ")}</strong> with the PDF attached.
          </p>
          <button
            type="button"
            onClick={() => {
              setStage("compose");
              setSentTo([]);
            }}
            className="mt-3 rounded-md border border-navy-200 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            Send another
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
      <header className="border-b border-navy-100 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-navy-800 uppercase">
          Send by email
        </h2>
        <p className="mt-0.5 text-xs text-navy-600/70">
          Sends the letter as a PDF attachment.
        </p>
      </header>

      <div className="space-y-3 p-4">
        <Row label="To" htmlFor="send-to">
          <input
            id="send-to"
            type="email"
            multiple
            value={effectiveTo}
            onChange={(e) => {
              setTouched(true);
              setTo(e.target.value);
            }}
            placeholder="subcontractor@example.com"
            className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
          {suggestedTo && !touched && (
            <p className="mt-1 text-[10px] text-navy-600/70">
              From the subcontractor&rsquo;s Quickbase record.
            </p>
          )}
        </Row>

        <Row label="Cc" htmlFor="send-cc">
          <input
            id="send-cc"
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Optional, comma separated"
            className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
        </Row>

        <Row label="Subject" htmlFor="send-subject">
          <input
            id="send-subject"
            type="text"
            value={effectiveSubject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
        </Row>

        <Row label="Message" htmlFor="send-text">
          <textarea
            id="send-text"
            rows={8}
            value={effectiveText}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-md border border-navy-200 px-2.5 py-2 font-mono text-xs leading-relaxed outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
          />
        </Row>

        {keyNeeded && (
          <Row label="Send key" htmlFor="send-key">
            <input
              id="send-key"
              type="password"
              value={sendKey}
              onChange={(e) => setSendKey(e.target.value)}
              placeholder="Required on this deployment"
              className="w-full rounded-md border border-navy-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20"
            />
            <p className="mt-1 text-[10px] text-navy-600/70">
              Remembered in this browser so you only enter it once.
            </p>
          </Row>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-brand-red/30 bg-brand-red-50 px-3 py-2 text-xs text-brand-red-dark"
          >
            {error}
          </p>
        )}
      </div>

      <div className="border-t-2 border-navy-200 bg-navy-50 p-4">
        {stage === "confirming" ? (
          <div className="rounded-md border border-brand-red/40 bg-white p-3">
            <p className="text-xs font-semibold text-navy-800">
              Send this award letter?
            </p>
            <dl className="mt-2 space-y-0.5 text-xs text-navy-700">
              <div>
                <span className="text-navy-600/70">To: </span>
                <strong>{effectiveTo}</strong>
              </div>
              {cc.trim() && (
                <div>
                  <span className="text-navy-600/70">Cc: </span>
                  {cc}
                </div>
              )}
              <div>
                <span className="text-navy-600/70">Subject: </span>
                {effectiveSubject}
              </div>
              <div>
                <span className="text-navy-600/70">Attached: </span>
                the letter as PDF
              </div>
            </dl>
            <p className="mt-2 text-[11px] text-navy-600/70">
              This goes to the subcontractor and cannot be recalled.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={send}
                className="rounded-md bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-red-dark"
              >
                Yes, send it
              </button>
              <button
                type="button"
                onClick={() => setStage("compose")}
                className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => setStage("confirming")}
              className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition ${
                canSend
                  ? "bg-navy-700 hover:bg-navy-800"
                  : "cursor-not-allowed bg-navy-300"
              }`}
            >
              {stage === "sending" ? "Sending…" : "Send Award Letter"}
            </button>
            <p className="mt-2 text-xs text-navy-600/70">
              {ready
                ? "You will be asked to confirm before anything is sent."
                : "Fill in the job name and subcontractor first."}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-navy-700">
        {label}
      </label>
      {children}
    </div>
  );
}
