import type { ITraceId } from '@zerospin/logger';

import type { IBrowserTracePresentation } from './makeBrowserTracePresentation.js';

export function TraceList({
  presentation,
  onSelect,
  onClear,
}: {
  presentation: IBrowserTracePresentation;
  onSelect: (traceId: ITraceId) => void;
  onClear: () => void;
}) {
  return (
    <aside
      aria-label="Browser traces"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 300,
        minWidth: 220,
        borderRight: '1px solid var(--zs-devtools-border)',
        backgroundColor: 'var(--zs-devtools-surface-muted)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--zs-devtools-border)',
        }}
      >
        <strong style={{ color: 'var(--zs-devtools-text)', fontSize: 12 }}>
          Traces ({presentation.traces.length})
        </strong>
        <button
          type="button"
          data-testid="clear-session-telemetry"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {presentation.traces.length === 0 ? (
          <div
            style={{
              padding: 12,
              color: 'var(--zs-devtools-muted)',
              fontSize: 11,
            }}
          >
            No scoped traces.
          </div>
        ) : (
          presentation.traces.map(row => (
            <button
              key={row.traceId}
              type="button"
              data-testid={`trace-list-item-${row.traceId}`}
              aria-pressed={presentation.view?.traceId === row.traceId}
              onClick={() => onSelect(row.traceId)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                width: '100%',
                padding: '8px 10px',
                border: 'none',
                borderBottom: '1px solid var(--zs-devtools-border)',
                backgroundColor:
                  presentation.view?.traceId === row.traceId
                    ? 'var(--zs-devtools-selected)'
                    : 'transparent',
                color: 'var(--zs-devtools-text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <code style={{ fontSize: 10 }}>{row.traceId}</code>
              <span style={{ color: 'var(--zs-devtools-muted)', fontSize: 10 }}>
                {row.timestamp === null
                  ? 'No local timing'
                  : new Date(row.timestamp).toISOString()}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
