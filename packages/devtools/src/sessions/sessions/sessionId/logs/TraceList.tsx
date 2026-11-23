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
        borderRight: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <strong style={{ color: '#111827', fontSize: 12 }}>
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
          <div style={{ padding: 12, color: '#6b7280', fontSize: 11 }}>
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
                borderBottom: '1px solid #e5e7eb',
                backgroundColor:
                  presentation.view?.traceId === row.traceId
                    ? '#dbeafe'
                    : 'transparent',
                color: '#111827',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <code style={{ fontSize: 10 }}>{row.traceId}</code>
              <span style={{ color: '#6b7280', fontSize: 10 }}>
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
