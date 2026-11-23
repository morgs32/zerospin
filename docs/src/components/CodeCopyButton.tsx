'use client';

import { useState } from 'react';

export function CodeCopyButton({ code }: { code: string }) {
  const [status, setStatus] = useState('');

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Copied');
    } catch {
      setStatus('Select the code and copy it manually.');
    }
  }

  return (
    <div className="docs-code-copy">
      <button type="button" onClick={copyCode} aria-label="Copy code">
        {status === 'Copied' ? 'Copied ✓' : 'Copy'}
      </button>
      <span className="docs-copy-status" role="status">
        {status}
      </span>
    </div>
  );
}
