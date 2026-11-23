'use client';

import { useEffect, useState, type CSSProperties } from 'react';

import { Copy, RefreshCw } from 'lucide-react';

import type { IErrorDiagnostic } from './errorDiagnostic.js';

const styles = {
  element: {
    boxSizing: 'border-box',
  } satisfies CSSProperties,
  diagnosticCode: {
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  } satisfies CSSProperties,
  root: {
    boxSizing: 'border-box',
    display: 'flex',
    minHeight: '100vh',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    background: 'color-mix(in srgb, var(--muted, #f4f4f5) 30%, transparent)',
    color: 'var(--foreground, #18181b)',
    fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
  } satisfies CSSProperties,
  card: {
    boxSizing: 'border-box',
    display: 'flex',
    width: '100%',
    maxWidth: '48rem',
    maxHeight: 'calc(100vh - 2rem)',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid var(--border, #e4e4e7)',
    borderRadius: 'var(--radius, 0.75rem)',
    background: 'var(--card, #fff)',
    color: 'var(--card-foreground, var(--foreground, #18181b))',
    boxShadow:
      '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  } satisfies CSSProperties,
  header: {
    boxSizing: 'border-box',
    display: 'grid',
    gap: '1rem',
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid var(--border, #e4e4e7)',
  } satisfies CSSProperties,
  heading: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'flex-start',
    minWidth: 0,
    gap: '0.75rem',
  } satisfies CSSProperties,
  identity: {
    boxSizing: 'border-box',
    display: 'grid',
    minWidth: 0,
    gap: '0.5rem',
  } satisfies CSSProperties,
  titleRow: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
  } satisfies CSSProperties,
  title: {
    boxSizing: 'border-box',
    margin: 0,
    fontSize: '1.125rem',
    lineHeight: '1.5rem',
    fontWeight: 600,
  } satisfies CSSProperties,
  status: {
    boxSizing: 'border-box',
    padding: '0.125rem 0.5rem',
    border: '1px solid var(--border, #e4e4e7)',
    borderRadius: '0.375rem',
    background: 'var(--muted, #f4f4f5)',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: '0.75rem',
  } satisfies CSSProperties,
  code: {
    boxSizing: 'border-box',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    display: 'block',
    overflowWrap: 'anywhere',
    color: 'var(--destructive, #dc2626)',
    fontSize: '0.875rem',
    fontWeight: 600,
  } satisfies CSSProperties,
  message: {
    boxSizing: 'border-box',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    margin: 0,
    overflowWrap: 'anywhere',
    fontSize: '0.75rem',
    lineHeight: 1.625,
  } satisfies CSSProperties,
  content: {
    boxSizing: 'border-box',
    minHeight: 0,
    overflowY: 'auto',
    padding: '1.25rem 1.5rem',
  } satisfies CSSProperties,
  summary: {
    boxSizing: 'border-box',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: '0.875rem',
    fontWeight: 600,
  } satisfies CSSProperties,
  details: {
    boxSizing: 'border-box',
    display: 'grid',
    gap: '1.25rem',
    paddingTop: '1rem',
  } satisfies CSSProperties,
  section: {
    boxSizing: 'border-box',
    display: 'grid',
    gap: '0.5rem',
  } satisfies CSSProperties,
  sectionTitle: {
    boxSizing: 'border-box',
    margin: 0,
    color: 'var(--muted-foreground, #71717a)',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.025em',
    textTransform: 'uppercase',
  } satisfies CSSProperties,
  pre: {
    boxSizing: 'border-box',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    maxHeight: '16rem',
    margin: 0,
    overflow: 'auto',
    border: '1px solid var(--border, #e4e4e7)',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    background: 'color-mix(in srgb, var(--muted, #f4f4f5) 50%, transparent)',
    fontSize: '0.75rem',
    lineHeight: 1.625,
    whiteSpace: 'pre-wrap',
  } satisfies CSSProperties,
  footer: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    padding: '1rem 1.5rem',
    borderTop: '1px solid var(--border, #e4e4e7)',
    flexWrap: 'wrap',
  } satisfies CSSProperties,
  button: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    minHeight: '2.25rem',
    justifyContent: 'center',
    gap: '0.5rem',
    border: '1px solid var(--primary, #18181b)',
    borderRadius: '0.375rem',
    padding: '0.5rem 1rem',
    background: 'var(--primary, #18181b)',
    color: 'var(--primary-foreground, #fafafa)',
    font: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
  } satisfies CSSProperties,
  buttonOutline: {
    boxSizing: 'border-box',
    borderColor: 'var(--border, #e4e4e7)',
    background: 'var(--background, #fff)',
    color: 'var(--foreground, #18181b)',
  } satisfies CSSProperties,
  buttonDisabled: {
    boxSizing: 'border-box',
    cursor: 'not-allowed',
    opacity: 0.5,
  } satisfies CSSProperties,
  icon: {
    boxSizing: 'border-box',
    width: '1rem',
    height: '1rem',
  } satisfies CSSProperties,
};

export function ErrorPage(props: {
  diagnostic: IErrorDiagnostic;
  onRetry: () => void;
  defaultDetailsOpen?: boolean;
  retryLabel?: string;
}) {
  const {
    diagnostic,
    onRetry,
    defaultDetailsOpen = false,
    retryLabel = 'Try again',
  } = props;
  const {
    errorKind,
    errorCode,
    message,
    status,
    structuredDetailsLabel,
    structuredDetails,
    cause,
    stack,
    diagnostics,
    backendTrace,
    digest,
  } = diagnostic;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const [detailsOpen, setDetailsOpen] = useState(defaultDetailsOpen);
  const [copyDisabled, setCopyDisabled] = useState(true);
  useEffect(() => {
    setCopyDisabled(navigator.clipboard === undefined);
  }, []);

  let diagnosticText: string;
  try {
    diagnosticText = JSON.stringify(diagnostics, null, 2);
  } catch {
    diagnosticText = `${errorKind}: ${message}`;
  }

  let structuredDetailsText: string | null = null;
  if (structuredDetailsLabel !== null) {
    try {
      structuredDetailsText = JSON.stringify(structuredDetails, null, 2);
    } catch {
      try {
        structuredDetailsText = String(structuredDetails);
      } catch {
        structuredDetailsText = 'The diagnostic value could not be displayed.';
      }
    }
  }

  const hasDetailedSections =
    structuredDetailsText !== null || cause !== null || stack !== null;

  return (
    <main style={styles.root}>
      <article
        role="alert"
        aria-labelledby="zerospin-error-title"
        style={styles.card}
      >
        <header style={styles.header}>
          <div style={styles.heading}>
            <div style={styles.identity}>
              <div style={styles.titleRow}>
                <h1 id="zerospin-error-title" style={styles.title}>
                  {errorKind}
                </h1>
                {status === null ? null : (
                  <span style={styles.status}>Status {status}</span>
                )}
              </div>
              {errorCode === null ? null : (
                <code style={styles.code}>{errorCode}</code>
              )}
            </div>
          </div>
          <p style={styles.message}>{message}</p>
          {backendTrace === null ? null : (
            <p style={styles.message}>
              Error reference: {backendTrace.traceId}/{backendTrace.spanId}
            </p>
          )}
          {digest === null ? null : (
            <p style={styles.message}>Error reference: {digest}</p>
          )}
        </header>

        <div style={styles.content}>
          <details
            style={styles.element}
            open={detailsOpen}
            onToggle={event => {
              setDetailsOpen(event.currentTarget.open);
            }}
          >
            <summary style={styles.summary}>
              {detailsOpen
                ? 'Hide diagnostic details'
                : 'Show diagnostic details'}
            </summary>
            <div style={styles.details}>
              {structuredDetailsText === null ? null : (
                <section style={styles.section}>
                  <h2 style={styles.sectionTitle}>{structuredDetailsLabel}</h2>
                  <pre style={styles.pre}>
                    <code style={styles.diagnosticCode}>
                      {structuredDetailsText}
                    </code>
                  </pre>
                </section>
              )}

              {cause === null ? null : (
                <section style={styles.section}>
                  <h2 style={styles.sectionTitle}>Cause</h2>
                  <pre style={styles.pre}>
                    <code style={styles.diagnosticCode}>{cause}</code>
                  </pre>
                </section>
              )}

              {stack === null ? null : (
                <section style={styles.section}>
                  <h2 style={styles.sectionTitle}>Stack</h2>
                  <pre style={{ ...styles.pre, maxHeight: '20rem' }}>
                    <code style={styles.diagnosticCode}>{stack}</code>
                  </pre>
                </section>
              )}

              {hasDetailedSections ? null : (
                <section style={styles.section}>
                  <h2 style={styles.sectionTitle}>Diagnostic payload</h2>
                  <pre style={styles.pre}>
                    <code style={styles.diagnosticCode}>{diagnosticText}</code>
                  </pre>
                </section>
              )}
            </div>
          </details>
        </div>

        <footer style={styles.footer}>
          <button
            type="button"
            style={{
              ...styles.button,
              ...styles.buttonOutline,
              ...(copyDisabled ? styles.buttonDisabled : {}),
            }}
            disabled={copyDisabled}
            onClick={() => {
              if (navigator.clipboard === undefined) {
                setCopyState('failed');
                return;
              }
              void navigator.clipboard.writeText(diagnosticText).then(
                () => setCopyState('copied'),
                () => setCopyState('failed'),
              );
            }}
          >
            <Copy aria-hidden="true" style={styles.icon} />
            <span aria-live="polite" style={styles.element}>
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'failed'
                  ? 'Copy failed'
                  : 'Copy diagnostics'}
            </span>
          </button>
          <button type="button" style={styles.button} onClick={onRetry}>
            <RefreshCw aria-hidden="true" style={styles.icon} />
            {retryLabel}
          </button>
        </footer>
      </article>
    </main>
  );
}
