import type { ISpanId, ITraceId } from '@zerospin/logger';

import type { IBrowserTracePresentation } from './makeBrowserTracePresentation.js';
import { SessionsLogsSpanNode } from './SessionsLogsSpanNode.js';
import { TraceDiagnosticRecords } from './TraceDiagnosticRecords.js';
import { TraceList } from './TraceList.js';
import { TraceSpanDetails } from './TraceSpanDetails.js';

export function SessionTraceInspector({
  presentation,
  onSelectTrace,
  onSelectSpan,
  onClear,
}: {
  presentation: IBrowserTracePresentation;
  onSelectTrace: (traceId: ITraceId) => void;
  onSelectSpan: (spanId: ISpanId) => void;
  onClear: () => void;
}) {
  const { view, span, unscopedLogs } = presentation;
  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        backgroundColor: '#ffffff',
      }}
    >
      <TraceList
        presentation={presentation}
        onSelect={onSelectTrace}
        onClear={onClear}
      />
      <main
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <section
          data-testid={view === null ? undefined : 'selected-trace'}
          style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflow: 'auto',
              padding: 12,
            }}
          >
            {view === null ? (
              <div style={{ color: '#6b7280', fontSize: 12 }}>
                No scoped trace selected.
              </div>
            ) : (
              <>
                <h2
                  style={{ margin: '0 0 10px', color: '#111827', fontSize: 13 }}
                >
                  {view.traceId}
                </h2>
                {view.roots.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: 11 }}>
                    No local spans.
                  </div>
                ) : (
                  <div
                    data-testid="span-waterfall"
                    style={{
                      minWidth: 560,
                      overflow: 'hidden',
                      border: '1px solid #e5e7eb',
                      borderRadius: 4,
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'minmax(180px, 320px) minmax(260px, 1fr)',
                        alignItems: 'center',
                        minHeight: 25,
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: '#f9fafb',
                        color: '#6b7280',
                        fontSize: 9,
                      }}
                    >
                      <span style={{ padding: '5px 8px' }}>Span</span>
                      <span
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '5px 8px',
                          borderLeft: '1px solid #e5e7eb',
                        }}
                      >
                        <span>0 ms</span>
                        <span>{view.duration} ms</span>
                      </span>
                    </div>
                    {view.roots.map(root => (
                      <SessionsLogsSpanNode
                        key={root.key}
                        node={root}
                        depth={0}
                        traceStartedAt={view.startedAt}
                        traceDuration={view.duration}
                        selectedSpanId={span?.spanId ?? null}
                        setSelectedSpanId={onSelectSpan}
                      />
                    ))}
                  </div>
                )}
                {(view.unattachedLogs.length > 0 ||
                  view.unattachedLinks.length > 0) && (
                  <section
                    data-testid="unattached-records"
                    style={{ marginTop: 14 }}
                  >
                    <h3 style={{ fontSize: 12 }}>Unattached</h3>
                    <TraceDiagnosticRecords
                      logs={view.unattachedLogs}
                      links={view.unattachedLinks}
                      placement="unattached"
                    />
                  </section>
                )}
                {view.diagnostics.length > 0 && (
                  <section
                    data-testid="trace-graph-diagnostics"
                    style={{ marginTop: 14 }}
                  >
                    <h3 style={{ fontSize: 12 }}>Graph diagnostics</h3>
                    {view.diagnostics.map((diagnostic, index) => (
                      <div key={index}>
                        <p style={{ fontSize: 11 }}>{diagnostic.message}</p>
                        <pre style={{ overflow: 'auto', fontSize: 10 }}>
                          {JSON.stringify(diagnostic.record, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
            {unscopedLogs.length > 0 && (
              <section data-testid="unscoped-logs" style={{ marginTop: 14 }}>
                <h3 style={{ fontSize: 12 }}>Unscoped</h3>
                <TraceDiagnosticRecords
                  logs={unscopedLogs}
                  placement="unscoped"
                />
              </section>
            )}
          </div>
          {span !== null && view !== null && (
            <TraceSpanDetails
              span={span}
              logs={view.logs.get(span.spanId) ?? []}
              links={view.links.get(span.spanId) ?? []}
            />
          )}
        </section>
      </main>
    </div>
  );
}
