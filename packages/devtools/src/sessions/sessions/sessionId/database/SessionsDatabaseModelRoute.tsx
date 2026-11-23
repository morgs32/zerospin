import { useParams } from 'react-router';

import { useAggregateSession, useServiceSession } from '../useSession';

import { SessionsDatabaseModelRowsTable } from './SessionsDatabaseModelRowsTable';

export function SessionsDatabaseModelRoute() {
  const aggregateSession = useAggregateSession();
  const serviceSession = useServiceSession();
  const { modelName } = useParams();

  if (
    (aggregateSession === undefined && serviceSession === undefined) ||
    modelName === undefined
  ) {
    return null;
  }

  let decoded = modelName;
  try {
    decoded = decodeURIComponent(modelName);
  } catch {
    // Malformed URI segments are literal model keys.
  }

  const isDeclaredAggregateModel =
    aggregateSession !== undefined &&
    Object.hasOwn(aggregateSession.sessionDefinition.models, decoded);
  const isDeclaredServiceModel =
    serviceSession !== undefined &&
    serviceSession.getModelAttributes(decoded) !== undefined;

  if (!isDeclaredAggregateModel && !isDeclaredServiceModel) {
    return <span>Unknown model key: {decoded}</span>;
  }

  return <SessionsDatabaseModelRowsTable modelKey={decoded} />;
}
