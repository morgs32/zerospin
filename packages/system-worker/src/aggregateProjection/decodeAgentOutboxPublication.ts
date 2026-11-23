import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { AggregateAgentExposedPublicationSchema } from '../aggregateSessionChain/aggregateExposedPublication.js';

import { aggregateAgentProjectionDbConfig } from './aggregateProjectionDbConfig.js';

/** A frozen public publication contains everything its retained Chain must acknowledge. */
export const decodeAgentOutboxPublication = Effect.fn(
  'AggregateProjection.decodeAgentOutboxPublication',
)(function* (props: { row: unknown }) {
  const { row } = props;

  return yield* Schema.decodeUnknownEffect(
    aggregateAgentProjectionDbConfig.tables.exposedCommandOutbox.codec,
  )(row, { onExcessProperty: 'error' }).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.toType(AggregateAgentExposedPublicationSchema),
      ),
    ),
  );
});
