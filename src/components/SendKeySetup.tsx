"use client";

import { useSyncExternalStore, useState } from "react";
import { forgetKey, rememberKey, storedKey, subscribeToKey } from "@/lib/send-key";

/**
 * Setting the send key once, from the bar at the top.
 *
 * Every route that writes to Quickbase is gated by it, so before this the key
 * was typed again on each screen that needed one — the award panel, the
 * billing panel, the advance panel. It is set here and each of them reads it.
 *
 * Read through useSyncExternalStore rather than an effect, because
 * localStorage does not exist while the page is rendered on the server and
 * reading it during render is what makes the two disagree.
 */

const serverSnapshot = () => "";

export default function SendKeySetup() {
  const key = useSyncExternalStore(subscribeToKey, storedKey, serverSnapshot);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  function save() {
    rememberKey(typed);
    setTyped("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          key
            ? "A send key is saved in this browser. Click to replace it."
            : "Set the send key once; every screen that writes will use it."
        }
        className="rounded-md border border-navy-400/60 px-2.5 py-1 font-medium text-navy-100 transition hover:bg-navy-600 hover:text-white"
      >
        {key ? "Send key ✓" : "Set send key"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="password"
        value={typed}
        autoFocus
        placeholder={key ? "Replace the saved key" : "Send key"}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-44 rounded-md border border-navy-400/60 bg-navy-800 px-2 py-1 text-xs text-white placeholder:text-navy-300/70 focus:border-navy-200 focus:outline-none"
      />
      <button
        type="button"
        onClick={save}
        disabled={!typed.trim()}
        className="rounded-md border border-navy-400/60 px-2 py-1 font-medium text-navy-100 transition hover:bg-navy-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save
      </button>
      {key ? (
        <button
          type="button"
          onClick={() => {
            forgetKey();
            setOpen(false);
          }}
          className="px-1 text-navy-300 underline underline-offset-2 hover:text-white"
        >
          Forget
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-1 text-navy-300 hover:text-white"
        aria-label="Cancel"
      >
        &times;
      </button>
    </div>
  );
}
