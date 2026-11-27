import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
} from '@zerospin/logger';

import { TraceDiagnosticRecords } from './TraceDiagnosticRecords.js';

export function TraceSpanDetails({
  span,
  logs,
  links,
}: {
  span: ISpanRecord;
  logs: readonly ILogRecord[];
  links: readonly ISpanLinkRecord[];
}) {
  return (
    <aside
      aria-label="Span details"
      data-testid="span-details"
      style={{
        width: 380,
        flexShrink: 0,
        minHeight: 0,
        overflow: 'auto',
        padding: 14,
        borderLeft: '1px solid var(--zs-devtools-border)',
        backgroundColor: 'var(--zs-devtools-surface-muted)',
      }}
    >
      <h2 style={{ margin: 0, color: 'var(--zs-devtools-text)', fontSize: 15 }}>
        {span.name}
      </h2>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '72px minmax(0, 1fr)',
          gap: '5px 8px',
          margin: '10px 0 0',
          fontSize: 10,
        }}
      >
        <dt>Span ID</dt>
        <dd style={{ margin: 0 }}>
          <code>{span.spanId}</code>
        </dd>
        <dt>Status</dt>
        <dd style={{ margin: 0 }}>{span.status}</dd>
        <dt>Duration</dt>
        <dd style={{ margin: 0 }}>
          {Math.max(span.endedAt - span.startedAt, 0)} ms
        </dd>
      </dl>
      <section style={{ marginTop: 16 }}>
        <h3
          style={{
            margin: '0 0 6px',
            color: 'var(--zs-devtools-text)',
            fontSize: 12,
          }}
        >
          Attributes
        </h3>
        {span.attributes === null ? (
          <div style={{ color: 'var(--zs-devtools-muted)', fontSize: 10 }}>
            No attributes.
          </div>
        ) : (
          <pre
            aria-label={`Attributes for ${span.name}`}
            style={{
              margin: 0,
              padding: 8,
              overflow: 'auto',
              border: '1px solid var(--zs-devtools-border)',
              borderRadius: 4,
              backgroundColor: 'var(--zs-devtools-surface)',
              color: 'var(--zs-devtools-text)',
              fontSize: 10,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(span.attributes, null, 2)}
          </pre>
        )}
      </section>
      {logs.length > 0 && <h3 style={{ fontSize: 12, marginTop: 16 }}>Logs</h3>}
      <TraceDiagnosticRecords logs={logs} links={links} placement="span" />
    </aside>
  );
}
