"use client";

import { useState } from "react";

interface CopyableHashProps {
  hash: string;
  label?: string;
  className?: string;
}

export function CopyableHash({ hash, label, className = "" }: CopyableHashProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(hash);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback: clipboard permission or unsupported
    }
  };

  return (
    <span className={`copyable-hash ${className}`}>
      <code className="copyable-hash__code" title={label ?? hash}>
        {hash}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="copyable-hash__btn"
        aria-label={copied ? "Hash copied to clipboard" : (label ? `Copy ${label}: ${hash}` : `Copy hash: ${hash}`)}
        title={copied ? "Copied to clipboard" : "Copy hash to clipboard"}
      >
        <span aria-live="polite" className="visually-hidden">
          {copied ? "Hash copied to clipboard" : ""}
        </span>
        {copied ? (
          <span className="copyable-hash__copied">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ display: "inline-block", verticalAlign: "middle", marginRight: "3px" }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied
          </span>
        ) : (
          <span className="copyable-hash__icon" aria-hidden="true">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
          </span>
        )}
      </button>
    </span>
  );
}
