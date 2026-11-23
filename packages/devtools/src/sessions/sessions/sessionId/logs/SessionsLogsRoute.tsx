import { useMemo, useState, useSyncExternalStore } from 'react';

import type { ISpanId, ITelemetryBatch } from '@zerospin/logger';
import { useSearchParams } from 'react-router';

import type {
  IDevtoolsAggregateSessionEntry,
  IDevtoolsServiceSessionEntry,
} from '../../../../types.js';
import { useAggregateSession, useServiceSession } from '../useSession';

import { makeBrowserTracePresentation } from './makeBrowserTracePresentation.js';
import { SessionTraceInspector } from './SessionTraceInspector.js';

function AggregateSessionsLogsRouteBody(props: {
  readonly session: IDevtoolsAggregateSessionEntry;
}) {
  const { session } = props;
  const telemetry = useSyncExternalStore(
    session.subscribe,
    session.getTelemetry,
    session.getTelemetry,
  );

  return (
    <SessionsLogsRouteBody
      telemetry={telemetry}
      onClear={session.clearTelemetry}
    />
  );
}

function ServiceSessionsLogsRouteBody(props: {
  readonly session: IDevtoolsServiceSessionEntry;
}) {
  const { session } = props;
  const telemetry = useSyncExternalStore(
    session.subscribe,
    session.getTelemetry,
    session.getTelemetry,
  );

  return (
    <SessionsLogsRouteBody
      telemetry={telemetry}
      onClear={session.clearTelemetry}
    />
  );
}

export function SessionsLogsRoute() {
  const aggregateSession = useAggregateSession();
  const serviceSession = useServiceSession();

  if (aggregateSession !== undefined) {
    return <AggregateSessionsLogsRouteBody session={aggregateSession} />;
  }

  if (serviceSession !== undefined) {
    return <ServiceSessionsLogsRouteBody session={serviceSession} />;
  }

  return null;
}

function SessionsLogsRouteBody({
  telemetry,
  onClear,
}: {
  readonly telemetry: ITelemetryBatch;
  readonly onClear: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const traceId = searchParams.get('traceId');
  const [spanId, setSpanId] = useState<ISpanId | null>(null);
  const presentation = useMemo(
    () => makeBrowserTracePresentation(telemetry, { traceId, spanId }),
    [telemetry, traceId, spanId],
  );
  return (
    <SessionTraceInspector
      presentation={presentation}
      onSelectTrace={selected => {
        setSpanId(null);
        setSearchParams({ traceId: selected });
      }}
      onSelectSpan={setSpanId}
      onClear={() => {
        onClear();
        setSpanId(null);
        setSearchParams({});
      }}
    />
  );
}
