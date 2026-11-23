import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import * as Effect from 'effect/Effect';
import { mapValues } from 'es-toolkit';

import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';

import { applyServiceProjectionCommandsTx } from './applyServiceProjectionCommandsTx.js';
import { readServiceResources } from './readServiceResources.js';
import {
  resolveServiceActorView,
  type IServiceProjectionKey,
} from './resolveServiceActorView.js';
import { serviceProjectionDbConfig } from './serviceProjectionDbConfig.js';

/** Bind actor selection and private ownership to the shared synchronous Service projection commit. */
export const applyEvaluatedCommandsTx = makeTx(
  'ServiceProjection.applyEvaluatedCommandsTx',
)(function* (
  tx: ITx,
  props: {
    rows: readonly IEvaluatedServiceCommand[];
    serviceRelease: IAnyServiceRelease;
    key: IServiceProjectionKey;
  },
) {
  const { serviceRelease, key } = props;
  const { encodedIdentity } = yield* resolveServiceActorView(
    serviceRelease,
    key,
  );
  yield* applyServiceProjectionCommandsTx(tx, {
    ...props,
    readResources: () => readServiceResources(tx, serviceRelease, key),
    publish: (output, command) =>
      Effect.gen(function* () {
        const { kind } = command;
        const ownsResolution =
          kind === 'actor' &&
          command.actorName === key.actorName &&
          command.actorVersion === key.actorVersion &&
          Object.values(
            mapValues(
              encodedIdentity,
              (value, field) => command.claims[field] === value,
            ),
          ).every(Boolean);
        const failure =
          ownsResolution && command.outcome.result._tag === 'Failure'
            ? command.outcome.result.failure
            : null;
        const encoded =
          yield* serviceProjectionDbConfig.tables.exposedCommandOutbox
            .encodeRow({
              ...output,
              commandResolution:
                ownsResolution && kind === 'actor'
                  ? {
                      nodeId: command.nodeId,
                      pushIndex: command.pushIndex,
                      sessionName: command.sessionName,
                      claims: command.claims,
                      failure,
                    }
                  : null,
            })
            .pipe(Effect.orDie);
        tx.insert(serviceProjectionDbConfig.schema.exposedCommandOutbox)
          .values(encoded)
          .run();
      }),
  });
});
