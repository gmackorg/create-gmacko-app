"use client";

import { useState } from "react";

import { Button } from "./button";

/**
 * The one-time reveal of a freshly minted API key. Masked until revealed,
 * copied through the clipboard, and gone once dismissed: the server never
 * shows the plaintext again.
 */
export function ApiKeySecret(props: {
  secret: string;
  onDismiss: () => void;
  /** Called after a successful copy (a toast, usually). */
  onCopied?: (() => void) | undefined;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const masked = `${props.secret.slice(0, 8)}${"•".repeat(Math.max(8, props.secret.length - 8))}`;

  const copy = async () => {
    await navigator.clipboard.writeText(props.secret);
    setCopied(true);
    props.onCopied?.();
  };

  return (
    <div
      className="rounded-lg border border-green-500 bg-green-50 p-4 dark:bg-green-950"
      data-testid="api-key-secret"
    >
      <p className="mb-2 font-medium text-green-800 dark:text-green-200">
        API Key Created Successfully
      </p>
      <p className="mb-2 text-sm text-green-700 dark:text-green-300">
        Copy this key now. You won&apos;t be able to see it again.
      </p>
      <div className="flex flex-wrap gap-2">
        <code
          className="min-w-0 flex-1 overflow-x-auto rounded bg-white p-2 font-mono text-sm dark:bg-gray-900"
          data-testid="api-key-plaintext"
          aria-label={revealed ? "API key" : "API key (hidden)"}
        >
          {revealed ? props.secret : masked}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? "Hide" : "Reveal"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="mt-2"
        onClick={props.onDismiss}
      >
        Dismiss
      </Button>
    </div>
  );
}
