import {
  compareSpanStarts,
  type ILogRecord,
  type ISpanId,
  type ISpanLinkRecord,
  type ISpanRecord,
  type ITelemetryBatch,
  type ITraceId,
} from '@zerospin/logger';

export type ISpanTreeNode = Readonly<{
  key: number;
  span: ISpanRecord;
  logs: readonly ILogRecord[];
  children: readonly ISpanTreeNode[];
}>;
type ITraceGraph = {
  traceId: ITraceId;
  spans: Map<ISpanId, ISpanRecord>;
  roots: ISpanTreeNode[];
  logs: Map<ISpanId, ILogRecord[]>;
  links: Map<ISpanId, ISpanLinkRecord[]>;
  unattachedLogs: ILogRecord[];
  unattachedLinks: ISpanLinkRecord[];
  diagnostics: { message: string; record: unknown }[];
  timestamp: number | null;
  startedAt: number;
  duration: number;
};

function retainUniqueRecords<A>(
  records: readonly A[],
  identity: (record: A) => string,
  conflict: (record: A) => void,
): A[] {
  const seen = new Map<string, Set<string>>();
  return records.filter(record => {
    const id = identity(record);
    const bytes = JSON.stringify(record);
    const values = seen.get(id);
    if (values?.has(bytes)) return false;
    if (values !== undefined) conflict(record);
    const retained = values ?? new Set<string>();
    retained.add(bytes);
    seen.set(id, retained);
    return true;
  });
}

/** One exact index and finite forest per trace. Conflicting identities and broken ancestry remain visible. */
export function buildBrowserTraceGraph(batch: ITelemetryBatch) {
  const traces = new Map<ITraceId, ITraceGraph>();
  const unscopedLogs: ILogRecord[] = [];
  const trace = (traceId: ITraceId) => {
    let value = traces.get(traceId);
    if (value === undefined) {
      value = {
        traceId,
        spans: new Map(),
        roots: [],
        logs: new Map(),
        links: new Map(),
        unattachedLogs: [],
        unattachedLinks: [],
        diagnostics: [],
        timestamp: null,
        startedAt: 0,
        duration: 1,
      };
      traces.set(traceId, value);
    }
    return value;
  };
  const spans = retainUniqueRecords(
    batch.spans,
    span => JSON.stringify([span.traceId, span.spanId]),
    span => {
      trace(span.traceId).diagnostics.push({
        message: 'Conflicting span identity; retained as a detached span.',
        record: span,
      });
    },
  );
  const nodesByTrace = new Map<
    ITraceId,
    { node: ISpanTreeNode; parent: ISpanTreeNode | null }[]
  >();
  const nodesByIdentity = new Map<string, ISpanTreeNode[]>();
  spans.forEach((span, key) => {
    const graph = trace(span.traceId);
    const node: ISpanTreeNode = { key, span, logs: [], children: [] };
    const nodes = nodesByTrace.get(span.traceId) ?? [];
    nodes.push({ node, parent: null });
    nodesByTrace.set(span.traceId, nodes);
    const identity = JSON.stringify([span.traceId, span.spanId]);
    const matches = nodesByIdentity.get(identity) ?? [];
    matches.push(node);
    nodesByIdentity.set(identity, matches);
    if (!graph.spans.has(span.spanId)) graph.spans.set(span.spanId, span);
    graph.timestamp =
      graph.timestamp === null
        ? span.startedAt
        : Math.min(graph.timestamp, span.startedAt);
  });
  for (const [traceId, entries] of nodesByTrace) {
    const graph = trace(traceId);
    const byNode = new Map(entries.map(entry => [entry.node, entry]));
    const position = new Map(
      entries.map((entry, index) => [entry.node, index]),
    );
    const order = (a: ISpanTreeNode, b: ISpanTreeNode) =>
      compareSpanStarts(a.span, b.span) ||
      (position.get(a) ?? 0) - (position.get(b) ?? 0);
    for (const entry of entries) {
      const span = entry.node.span;
      const duplicates = nodesByIdentity.get(
        JSON.stringify([traceId, span.spanId]),
      );
      if (span.parentSpanId === null || (duplicates?.length ?? 0) > 1) continue;
      const parents = nodesByIdentity.get(
        JSON.stringify([traceId, span.parentSpanId]),
      );
      if (parents?.length === 1) {
        entry.parent = parents[0] ?? null;
      } else {
        graph.diagnostics.push({
          message:
            parents === undefined
              ? 'Parent span is unavailable in this trace; retained as a detached root.'
              : 'Parent span identity is ambiguous; retained as a detached root.',
          record: span,
        });
      }
    }
    // Follow each parent path once; cut every cycle participant's edge before rendering.
    const finished = new Set<ISpanTreeNode>();
    for (const entry of entries) {
      const path: ISpanTreeNode[] = [];
      const pathPositions = new Map<ISpanTreeNode, number>();
      let current: ISpanTreeNode | null = entry.node;
      while (current !== null && !finished.has(current)) {
        const cycleStart = pathPositions.get(current);
        if (cycleStart !== undefined) {
          for (const cyclic of path.slice(cycleStart)) {
            const cyclicEntry = byNode.get(cyclic);
            if (cyclicEntry !== undefined) cyclicEntry.parent = null;
            graph.diagnostics.push({
              message:
                'Cyclic parent relationship; retained as a detached root.',
              record: cyclic.span,
            });
          }
          break;
        }
        pathPositions.set(current, path.length);
        path.push(current);
        current = byNode.get(current)?.parent ?? null;
      }
      path.forEach(node => finished.add(node));
    }
    const children = new Map<ISpanTreeNode, ISpanTreeNode[]>();
    for (const entry of entries) {
      if (entry.parent === null) {
        graph.roots.push(entry.node);
      } else {
        const siblings = children.get(entry.parent) ?? [];
        siblings.push(entry.node);
        children.set(entry.parent, siblings);
      }
    }
    for (const entry of entries) {
      Object.assign(entry.node, {
        children: (children.get(entry.node) ?? []).sort(order),
      });
    }
    graph.roots.sort(order);
    graph.startedAt = graph.timestamp ?? 0;
    for (const entry of entries) {
      graph.duration = Math.max(
        graph.duration,
        entry.node.span.endedAt - graph.startedAt,
      );
    }
  }
  const logs = retainUniqueRecords(
    batch.logs,
    log => log.logId,
    log => {
      if (log.traceId !== null) {
        trace(log.traceId).diagnostics.push({
          message: 'Conflicting log identity; both records are retained.',
          record: log,
        });
      }
    },
  ).sort((a, b) => a.createdAt - b.createdAt);
  for (const log of logs) {
    if (log.traceId === null) {
      unscopedLogs.push(log);
      continue;
    }
    const graph = trace(log.traceId);
    if (graph.spans.size === 0) {
      graph.timestamp =
        graph.timestamp === null
          ? log.createdAt
          : Math.min(graph.timestamp, log.createdAt);
    }
    if (log.spanId === null || !graph.spans.has(log.spanId)) {
      graph.unattachedLogs.push(log);
    } else {
      const attached = graph.logs.get(log.spanId) ?? [];
      attached.push(log);
      graph.logs.set(log.spanId, attached);
    }
  }
  for (const link of retainUniqueRecords(
    batch.links,
    link => link.linkId,
    link => {
      trace(link.priorTraceId).diagnostics.push({
        message: 'Conflicting link identity; both records are retained.',
        record: link,
      });
    },
  )) {
    const graph = trace(link.priorTraceId);
    if (!graph.spans.has(link.priorSpanId)) {
      graph.unattachedLinks.push(link);
    } else {
      const attached = graph.links.get(link.priorSpanId) ?? [];
      attached.push(link);
      graph.links.set(link.priorSpanId, attached);
    }
  }
  for (const [traceId, entries] of nodesByTrace) {
    const graph = trace(traceId);
    for (const { node } of entries) {
      Object.assign(node, { logs: graph.logs.get(node.span.spanId) ?? [] });
    }
  }
  return { traces, unscopedLogs };
}

export function makeBrowserTracePresentation(
  batch: ITelemetryBatch,
  request: { traceId: string | null; spanId: ISpanId | null },
) {
  const graph = buildBrowserTraceGraph(batch);
  const traces = [...graph.traces.values()].sort((left, right) => {
    if (left.timestamp === null && right.timestamp === null) {
      return left.traceId.localeCompare(right.traceId);
    }
    if (left.timestamp === null) return 1;
    if (right.timestamp === null) return -1;
    return (
      right.timestamp - left.timestamp ||
      left.traceId.localeCompare(right.traceId)
    );
  });
  const view =
    traces.find(candidate => candidate.traceId === request.traceId) ??
    traces[0] ??
    null;
  const span =
    view === null
      ? null
      : ((request.spanId === null
          ? undefined
          : view.spans.get(request.spanId)) ??
        view.roots[0]?.span ??
        null);
  return { traces, view, span, unscopedLogs: graph.unscopedLogs };
}

export type IBrowserTracePresentation = ReturnType<
  typeof makeBrowserTracePresentation
>;
