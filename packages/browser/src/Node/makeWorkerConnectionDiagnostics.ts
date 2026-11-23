import * as Cause from 'effect/Cause';
import * as Schema from 'effect/Schema';

import { snapshotFailureCodes } from './nodeRpcErrorFor.ts';

const diagnosticFailureCodes = new Set<string>([
  ...snapshotFailureCodes,
  'node-credentials-timeout',
  'node-local-preparation-timeout',
  'node-storage-owner-busy',
  'node-backend-timeout',
  'node-backend-unreachable',
  'node-authentication-unavailable',
  'node-connection-unavailable',
  'node-connection-release-failed',
  'node-worker-name-invalid',
  'node-worker-version-mismatch',
  'node-worker-artifact-mismatch',
  'node-session-definition-mismatch',
  'node-epoch-changed',
  'node-tab-detached',
  'standalone-worker-unavailable',
  'standalone-capability-stale',
]);

export interface IWorkerConnectionFailure {
  scope: 'page' | 'worker';
  phase: string;
  reason: string;
  clientId?: string | null | undefined;
  sessionName?: string | undefined;
  sharedWorkerUrl?: string | undefined;
  lastCompletedPhase?: string | null | undefined;
  elapsedMs?: number | undefined;
  timeoutMs?: number | undefined;
  error?: unknown;
  event?: unknown;
}

function sanitizeUrl(value: string): string | null {
  try {
    const url = new URL(value, globalThis.location?.href);
    if (url.protocol === 'blob:') {
      const nested = sanitizeUrl(url.pathname);
      return nested === null ? 'blob:' : `blob:${nested}`;
    }
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href.slice(0, 1024);
  } catch {
    return null;
  }
}

/** Project categories and declared codes; rendered failure text is never diagnostic metadata. */
function failureText(error: unknown, depth = 0): string | null {
  if (error === undefined || error === null) return null;
  if (Schema.isSchemaError(error)) {
    return 'SchemaError: Session data failed validation';
  }
  if (Cause.isCause(error)) {
    if (depth >= 2) return 'Cause';
    return [
      ...new Set(
        error.reasons
          .slice(0, 4)
          .map(reason =>
            Cause.isFailReason(reason)
              ? failureText(reason.error, depth + 1)
              : Cause.isDieReason(reason)
                ? failureText(reason.defect, depth + 1)
                : 'Interrupted',
          ),
      ),
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 8192);
  }
  if (typeof error !== 'object') return 'Unknown failure';
  const candidateCode = 'code' in error ? error.code : undefined;
  const code =
    typeof candidateCode === 'string' &&
    diagnosticFailureCodes.has(candidateCode)
      ? candidateCode
      : '';
  const category =
    code ||
    (error instanceof TypeError
      ? 'TypeError'
      : error instanceof SyntaxError
        ? 'SyntaxError'
        : error instanceof Error
          ? 'Error'
          : 'Unknown failure');
  const cause =
    depth < 2 && 'cause' in error ? failureText(error.cause, depth + 1) : null;
  return (cause === null ? category : `${category}\nCaused by: ${cause}`).slice(
    0,
    8192,
  );
}

function eventDetails(event: unknown) {
  if (typeof event !== 'object' || event === null) return undefined;
  const type = 'type' in event ? event.type : undefined;
  const filename = 'filename' in event ? event.filename : undefined;
  const lineno = 'lineno' in event ? event.lineno : undefined;
  const colno = 'colno' in event ? event.colno : undefined;
  return {
    type:
      typeof type === 'string' &&
      ['error', 'messageerror', 'unhandledrejection'].includes(type)
        ? type
        : 'unknown',
    ...(typeof filename === 'string'
      ? { filename: sanitizeUrl(filename) }
      : {}),
    ...(typeof lineno === 'number' && Number.isFinite(lineno)
      ? { lineno }
      : {}),
    ...(typeof colno === 'number' && Number.isFinite(colno) ? { colno } : {}),
  };
}

/** Snapshot only diagnostic fields; logging never owns the connection outcome. */
export function reportWorkerConnectionFailure(
  props: IWorkerConnectionFailure,
): void {
  const {
    scope,
    phase,
    reason,
    clientId = null,
    sessionName,
    sharedWorkerUrl,
    lastCompletedPhase = null,
    elapsedMs = 0,
    timeoutMs,
    error,
    event,
  } = props;
  try {
    let formattedFailure: string | null;
    let platformEvent: ReturnType<typeof eventDetails>;
    try {
      const eventError =
        event instanceof Error
          ? event
          : typeof event === 'object' && event !== null && 'error' in event
            ? event.error
            : undefined;
      formattedFailure = failureText(error ?? eventError);
    } catch {
      formattedFailure = '[Error details unavailable]';
    }
    try {
      platformEvent = eventDetails(event);
    } catch {
      platformEvent = { type: 'unavailable' };
    }
    const record = {
      scope,
      ...(sessionName === undefined
        ? {}
        : { sessionName: sessionName.slice(0, 128) }),
      clientId,
      sharedWorkerUrl:
        sharedWorkerUrl === undefined ? null : sanitizeUrl(sharedWorkerUrl),
      phase,
      lastCompletedPhase,
      reason,
      elapsedMs,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      error: formattedFailure,
      event: platformEvent,
    };
    console.error(
      'Zerospin SharedWorker connection failed',
      JSON.stringify(record),
    );
  } catch {
    // A malformed thrown value or unavailable console cannot change execution.
  }
}

function now(): number {
  try {
    return performance.now();
  } catch {
    return 0;
  }
}

export function makeWorkerConnectionDiagnostics(props: {
  sharedWorkerUrl: string;
  sessionName: string;
  verbose?: boolean | undefined;
  recordPhase?:
    | ((
        phase: string,
        durationMs: number,
        outcome: 'success' | 'failure',
        errorCode: string | null,
      ) => void)
    | undefined;
}) {
  const { sharedWorkerUrl, sessionName, verbose = false, recordPhase } = props;
  const startedAt = now();
  let phaseStartedAt = startedAt;
  let phase = 'connection.start';
  let lastCompletedPhase: string | null = null;
  let reported = false;
  return {
    clientId: null as string | null,
    step(nextPhase: string): void {
      phase = nextPhase;
      phaseStartedAt = now();
    },
    complete(completedPhase: string): void {
      lastCompletedPhase = completedPhase;
      try {
        const durationMs = Math.max(0, now() - phaseStartedAt);
        if (recordPhase !== undefined) {
          recordPhase(completedPhase, durationMs, 'success', null);
        } else if (verbose) {
          console.info(
            'Zerospin SharedWorker connection phase',
            JSON.stringify({
              scope: 'page',
              sessionName,
              clientId: this.clientId,
              sharedWorkerUrl: sanitizeUrl(sharedWorkerUrl),
              phase: completedPhase,
              durationMs,
              outcome: 'success',
            }),
          );
        }
      } catch {
        // Optional phase observers cannot fail startup.
      }
    },
    fail(failure: {
      reason: string;
      error?: unknown;
      event?: unknown;
      timeoutMs?: number;
    }): void {
      if (reported) return;
      reported = true;
      reportWorkerConnectionFailure({
        ...failure,
        scope: 'page',
        sharedWorkerUrl,
        sessionName,
        clientId: this.clientId,
        phase,
        lastCompletedPhase,
        elapsedMs: Math.max(0, now() - startedAt),
      });
      try {
        const error = failure.error;
        const candidateCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined;
        const code =
          typeof candidateCode === 'string' &&
          diagnosticFailureCodes.has(candidateCode)
            ? candidateCode
            : null;
        recordPhase?.(
          phase,
          Math.max(0, now() - phaseStartedAt),
          'failure',
          code,
        );
      } catch {
        // Optional phase observers cannot replace the originating failure.
      }
    },
  };
}

export type IWorkerConnectionDiagnostics = ReturnType<
  typeof makeWorkerConnectionDiagnostics
>;
