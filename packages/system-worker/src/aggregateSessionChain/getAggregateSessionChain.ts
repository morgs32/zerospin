import { mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { AggregateProjectionKeySchema } from '../aggregateProjection/resolveAggregateProjectionView.js';
import { AggregateActorVersionChains } from '../repoServices/AggregateActorVersionChains.js';
import { AggregateAgentVersionChains } from '../repoServices/AggregateAgentVersionChains.js';

export const getAggregateSessionChain = Effect.fn('getAggregateSessionChain')(
  function* (props: {
    key: Readonly<Record<string, string | number | undefined>>;
  }) {
    const { key: inputKey } = props;

    const key = yield* Schema.decodeUnknownEffect(AggregateProjectionKeySchema)(
      inputKey,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-session-key-invalid',
        prefix: 'Invalid aggregate session identity',
      }),
    );
    if ('actorName' in key) {
      const chains = yield* AggregateActorVersionChains;
      return yield* chains.getRepo({ key });
    }
    const chains = yield* AggregateAgentVersionChains;
    return yield* chains.getRepo({ key });
  },
);
