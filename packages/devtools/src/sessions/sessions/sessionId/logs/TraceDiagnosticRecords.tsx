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
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            backgroundColor: placement === 'unattached' ? '#fff7ed' : '#ffffff',
            color: '#374151',
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
            border: '1px solid #bfdbfe',
            borderRadius: 4,
            backgroundColor: placement === 'unattached' ? '#fff7ed' : '#eff6ff',
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
            <strong style={{ color: '#1e3a8a', fontSize: 11 }}>
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
              color: '#1e3a8a',
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
