import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import * as Effect from 'effect/Effect';

import { applyServiceProjectionCommandsTx } from '../serviceProjection/applyServiceProjectionCommandsTx.js';
import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';

import { readServiceAgentResources } from './readServiceAgentResources.js';
import {
  resolveServiceAgentView,
  type IServiceAgentProjectionKey,
} from './resolveServiceAgentView.js';
import { serviceAgentProjectionDbConfig } from './serviceAgentProjectionDbConfig.js';

/** Commit resources, checkpoint and complete pending publication in one synchronous transaction. */
export const applyEvaluatedCommands = Effect.fn(
  'ServiceAgentProjection.applyEvaluatedCommands',
)(function* (props: {
  rows: readonly IEvaluatedServiceCommand[];
  db: IDb;
  key: IServiceAgentProjectionKey;
}) {
  const { db, key, rows } = props;
  const { agent, serviceRelease } = yield* resolveServiceAgentView(key);
  yield* makeTx('ServiceAgentProjection.applyEvaluatedCommandsTx')(function* (
    tx: ITx,
  ) {
    yield* applyServiceProjectionCommandsTx(tx, {
      rows,
      key,
      serviceRelease,
      readResources: () => readServiceAgentResources({ db: tx, agent }),
      publish: output =>
        Effect.gen(function* () {
          const encoded =
            yield* serviceAgentProjectionDbConfig.tables.exposedCommandOutbox
              .encodeRow(output)
              .pipe(Effect.orDie);
          tx.insert(serviceAgentProjectionDbConfig.schema.exposedCommandOutbox)
            .values(encoded)
            .run();
        }),
    });
  })(db);
});
