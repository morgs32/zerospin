import * as Context from 'effect/Context';

import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
  ITelemetryBatch,
} from './types.ts';

export type ITelemetryCollector = {
  addSpan: (span: ISpanRecord) => void;
  addLog: (log: ILogRecord) => void;
  addLinks: (links: readonly ISpanLinkRecord[]) => void;
  /** Received records enrich local history; their producer owns hosted export. */
  merge: (batch: ITelemetryBatch) => void;
  /** Drain produced records without removing them from the complete snapshot. */
  flushOwn: () => ITelemetryBatch;
  flush: () => ITelemetryBatch;
};

export class TelemetryCollector extends Context.Service<
  TelemetryCollector,
  ITelemetryCollector
>()('TelemetryCollector') {}

export const makeTelemetryCollector = (): ITelemetryCollector => {
  let spans: ISpanRecord[] = [];
  let logs: ILogRecord[] = [];
  let links: ISpanLinkRecord[] = [];
  let ownSpans: ISpanRecord[] = [];
  let ownLogs: ILogRecord[] = [];
  let ownLinks: ISpanLinkRecord[] = [];

  return {
    addSpan: span => {
      spans.push(span);
      ownSpans.push(span);
    },
    addLog: log => {
      logs.push(log);
      ownLogs.push(log);
    },
    addLinks: newLinks => {
      links.push(...newLinks);
      ownLinks.push(...newLinks);
    },
    merge: batch => {
      spans.push(...batch.spans);
      logs.push(...batch.logs);
      links.push(...batch.links);
    },
    flushOwn: () => {
      const batch: ITelemetryBatch = {
        spans: ownSpans,
        logs: ownLogs,
        links: ownLinks,
      };
      ownSpans = [];
      ownLogs = [];
      ownLinks = [];
      return batch;
    },
    flush: () => {
      const batch: ITelemetryBatch = { spans, logs, links };
      spans = [];
      logs = [];
      links = [];
      ownSpans = [];
      ownLogs = [];
      ownLinks = [];
      return batch;
    },
  };
};
