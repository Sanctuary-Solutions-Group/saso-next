"use client";

import { useState } from "react";

interface SaInputProps {
  value: string;
  onChange: (v: string) => void;
  demo?: string;              // visible demo text before focus
  type?: string;
  className?: string;
  numericSelect?: boolean;     // for dropdown (0–10)
}

/**
 * SaInput
 * Consistent input styling for the SaSo platform.
 * - Shows demo text before first focus
 * - Clears demo text on focus
 * - Outlined input always visible
 * - Supports numeric dropdown mode (0–10)
 */
export function SaInput({
  value,
  onChange,
  demo = "",
  type = "text",
  className = "",
  numericSelect = false,
}: SaInputProps) {
  const [focused, setFocused] = useState(false);

  //
  // ─────────────────────────────────────────────────────────────
  // MODE: Numeric Dropdown (Adults / Children / Animals)
  // ─────────────────────────────────────────────────────────────
  //
  if (numericSelect) {
    return (
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 ${className}`}
      >
        <option value="">Select…</option>
        {Array.from({ length: 11 }).map((_, i) => (
          <option key={i} value={i.toString()}>
            {i}
          </option>
        ))}
      </select>
    );
  }

  //
  // ─────────────────────────────────────────────────────────────
  // MODE: Standard Input with Demo Text
  // ─────────────────────────────────────────────────────────────
  //
  const showDemo = !focused && !value;

  return (
    <input
      type={type}
      value={showDemo ? demo : value}
      onFocus={() => {
        setFocused(true);
        if (showDemo) onChange(""); // clear demo text
      }}
      onBlur={() => {
        if (!value) setFocused(false);
      }}
      onChange={(e) => onChange(e.target.value)}
      className={`
        w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm
        shadow-sm focus:border-blue-500 focus:ring-blue-500
        ${showDemo ? "text-slate-400" : "text-slate-900"}
        ${className}
      `}
    />
  );
}
