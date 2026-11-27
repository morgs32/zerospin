import type { ISpanId } from '@zerospin/logger';

import type { ISpanTreeNode } from './makeBrowserTracePresentation.js';

export function SessionsLogsSpanNode(props: {
  readonly node: ISpanTreeNode;
  readonly depth: number;
  readonly traceStartedAt: number;
  readonly traceDuration: number;
  readonly selectedSpanId: ISpanId | null;
  readonly setSelectedSpanId: (spanId: ISpanId) => void;
}) {
  const {
    node,
    depth,
    traceStartedAt,
    traceDuration,
    selectedSpanId,
    setSelectedSpanId,
  } = props;
  const spanDuration = Math.max(node.span.endedAt - node.span.startedAt, 0);
  const startPercent =
    ((node.span.startedAt - traceStartedAt) / traceDuration) * 100;
  const widthPercent = (spanDuration / traceDuration) * 100;

  return (
    <div data-testid={`span-${node.span.spanId}`}>
      {/* 1 — The whole row is the selection target. The name column indents
      independently so every duration bar keeps the same trace-wide axis. */}
      <button
        type="button"
        aria-label={`Select span ${node.span.name}`}
        aria-pressed={selectedSpanId === node.span.spanId}
        onClick={() => setSelectedSpanId(node.span.spanId)}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 320px) minmax(260px, 1fr)',
          alignItems: 'center',
          width: '100%',
          minHeight: 30,
          padding: 0,
          border: 'none',
          borderBottom: '1px solid var(--zs-devtools-border)',
          backgroundColor:
            selectedSpanId === node.span.spanId
              ? 'var(--zs-devtools-selected)'
              : 'var(--zs-devtools-surface)',
          color: 'var(--zs-devtools-text)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            minWidth: 0,
            padding: `6px 8px 6px ${8 + depth * 16}px`,
          }}
        >
          <strong
            style={{
              minWidth: 0,
              overflow: 'hidden',
              fontSize: 11,
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.span.name}
          </strong>
          <span
            style={{
              flexShrink: 0,
              color: 'var(--zs-devtools-muted)',
              fontSize: 10,
            }}
          >
            {spanDuration} ms
          </span>
        </span>

        {/* 2 — Percentages are derived from the selected trace's single
        timing range. A three-pixel minimum keeps instant spans selectable. */}
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            height: 20,
            overflow: 'hidden',
            borderLeft: '1px solid var(--zs-devtools-border)',
            backgroundImage:
              'linear-gradient(to right, var(--zs-devtools-border) 1px, transparent 1px)',
            backgroundSize: '10% 100%',
          }}
        >
          <span
            data-testid={`span-waterfall-bar-${node.span.spanId}`}
            style={{
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: `${startPercent}%`,
              width: `${widthPercent}%`,
              minWidth: 3,
              borderRadius: 2,
              backgroundColor:
                node.span.status === 'error'
                  ? 'var(--zs-devtools-danger)'
                  : node.span.status === 'lost'
                    ? 'var(--zs-devtools-warning)'
                    : 'var(--zs-devtools-accent)',
            }}
          />
        </span>
      </button>

      {/* 3 — Tree recursion preserves execution hierarchy while every child
      receives the exact same timing range and selection state. */}
      {node.children.map(child => (
        <SessionsLogsSpanNode
          key={child.key}
          node={child}
          depth={depth + 1}
          traceStartedAt={traceStartedAt}
          traceDuration={traceDuration}
          selectedSpanId={selectedSpanId}
          setSelectedSpanId={setSelectedSpanId}
        />
      ))}
    </div>
  );
}
