import type { ILogRecord, ISpanLinkRecord } from '@zerospin/logger';

/** Shared retained-record renderer for attached, unattached and unscoped diagnostics. */
export function TraceDiagnosticRecords({
  logs,
  links = [],
  placement,
}: {
  logs: readonly ILogRecord[];
  links?: readonly ISpanLinkRecord[];
  placement: 'span' | 'unattached' | 'unscoped';
}) {
  return (
    <>
      {logs.map((log, index) => (
        <pre
          key={`${log.logId}:${index}`}
          data-testid={`${placement}-log-${log.logId}`}
          style={{
            margin: '6px 0 0',
            padding: 8,
            overflow: 'auto',
            border: '1px solid var(--zs-devtools-border)',
            borderRadius: 4,
            backgroundColor:
              placement === 'unattached'
                ? 'var(--zs-devtools-warning-surface)'
                : 'var(--zs-devtools-surface)',
            color: 'var(--zs-devtools-text)',
            fontSize: 10,
          }}
        >
          {JSON.stringify(log, null, 2)}
        </pre>
      ))}
      {links.map((link, index) => (
        <div
          key={`${link.linkId}:${index}`}
          data-testid={`${placement === 'span' ? 'attached' : placement}-link-${link.linkId}`}
          style={{
            marginTop: 12,
            padding: 8,
            border: '1px solid var(--zs-devtools-accent)',
            borderRadius: 4,
            backgroundColor:
              placement === 'unattached'
                ? 'var(--zs-devtools-warning-surface)'
                : 'var(--zs-devtools-selected)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <strong
              style={{ color: 'var(--zs-devtools-accent)', fontSize: 11 }}
            >
              {placement === 'unattached'
                ? 'Server link without browser span'
                : 'Server link'}
            </strong>
            <button
              type="button"
              aria-label={`Copy server trace ${link.traceId}`}
              onClick={() => {
                void navigator.clipboard.writeText(link.traceId);
              }}
            >
              Copy server trace ID
            </button>
          </div>
          <pre
            style={{
              margin: '6px 0 0',
              overflow: 'auto',
              color: 'var(--zs-devtools-accent)',
              fontSize: 10,
            }}
          >
            {JSON.stringify(link, null, 2)}
          </pre>
        </div>
      ))}
    </>
  );
}
