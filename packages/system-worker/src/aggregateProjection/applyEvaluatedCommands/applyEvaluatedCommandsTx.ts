import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { applyDeferredOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeSelectedResourceDelta } from '@zerospin/core/models/reads/makeSelectedResourceDelta';
import { readSelectedResources } from '@zerospin/core/models/reads/readSelectedResources';
import { makeZerospinError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { mapValues } from 'es-toolkit';

import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../../aggregateDispositionChainHash/aggregateDispositionChainHash.js';
import type { IEvaluatedAggregateCommand } from '../../AggregateVersionChain/evaluatedAggregateCommand.js';
import {
  aggregateAgentProjectionDbConfig,
  aggregateProjectionDbConfig,
} from '../aggregateProjectionDbConfig.js';
import {
  resolveAggregateProjectionView,
  type IAggregateProjectionKey,
} from '../resolveAggregateProjectionView.js';

import { prepareEvaluatedCommandForReplay } from './prepareEvaluatedCommandForReplay.js';

/** Replay the owner's complete local order and queue selected outputs in one transaction. */
export const applyEvaluatedCommandsTx = makeTx(
  'AggregateProjection.applyEvaluatedCommandsTx',
)(function* (
  tx: ITx,
  props: {
    rows: readonly IEvaluatedAggregateCommand[];
    aggregateRelease: IAnyAggregateRelease;
    key: IAggregateProjectionKey;
  },
) {
  const { rows, aggregateRelease, key } = props;
  const view = yield* resolveAggregateProjectionView({ key, aggregateRelease });
  const { selectionBindings, encodedIdentity } = view;
  tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  const { schema, tables } = aggregateProjectionDbConfig;
  const head = tx
    .select()
    .from(schema.materializationHead)
    .where(eq(schema.materializationHead.singletonId, 1))
    .get();
  let cursor = head?.aggregateIndex ?? 0;
  let dispositionChainHash =
    head?.dispositionChainHash ?? genesisDispositionChainHash();

  const freshCount = new Set(
    rows
      .filter(row => row.aggregateIndex > cursor)
      .map(row => row.aggregateIndex),
  ).size;
  if (freshCount > 64) {
    return yield* makeZerospinError('projection-publication-batch-too-large');
  }
  const pendingCount =
    tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.exposedCommandOutbox)
      .get()?.count ?? 0;
  if (pendingCount + freshCount > 64) {
    return yield* makeZerospinError('projection-publication-backlog-full');
  }

  const selection = {
    db: tx,
    models:
      view.kind === 'agent' ? view.exposedModels : aggregateRelease.models,
    exposedModels: view.exposedModels,
    requireReferenceClosure: view.requireReferenceClosure,
    selections: view.selections,
    identity: selectionBindings,
  };
  let previousSelectedResources = yield* readSelectedResources(selection);

  for (const input of rows) {
    const { evaluatedCommand, modelOperations } =
      yield* prepareEvaluatedCommandForReplay({ input, aggregateRelease, key });
    const { aggregateIndex, id, commandName, outcome } = evaluatedCommand;
    // AggregateVersionChain has already fixed command identity at repeated positions.
    if (aggregateIndex <= cursor) continue;
    if (aggregateIndex !== cursor + 1) {
      return yield* makeZerospinError('projection-result-index-gap');
    }

    const nextDispositionChainHash = advanceDispositionChainHash({
      previousDispositionChainHash: dispositionChainHash,
      aggregateIndex,
      commandId: id,
      outcome,
    });
    if (nextDispositionChainHash !== evaluatedCommand.dispositionChainHash) {
      return yield* makeZerospinError(
        'projection-disposition-chain-hash-mismatch',
      );
    }
    for (const { operation, appliedAt } of modelOperations) {
      yield* applyDeferredOperationTx({ tx, operation, appliedAt });
    }

    const nextSelectedResources = yield* readSelectedResources(selection);
    const delta = makeSelectedResourceDelta({
      before: previousSelectedResources,
      after: nextSelectedResources,
    });
    const checkpoint = {
      aggregateIndex,
      dispositionChainHash: nextDispositionChainHash,
    };
    const publication = { ...checkpoint, id, commandName, delta };
    if ('actorName' in key) {
      const commandResolution =
        evaluatedCommand.kind === 'actor' &&
        evaluatedCommand.actorName === key.actorName &&
        evaluatedCommand.actorVersion === key.actorVersion &&
        Object.values(
          mapValues(
            encodedIdentity,
            (value, field) => evaluatedCommand.claims[field] === value,
          ),
        ).every(Boolean)
          ? {
              nodeId: evaluatedCommand.nodeId,
              pushIndex: evaluatedCommand.pushIndex,
              sessionName: evaluatedCommand.sessionName,
              claims: evaluatedCommand.claims,
              failure:
                outcome.result._tag === 'Failure'
                  ? outcome.result.failure
                  : null,
            }
          : null;
      const row = yield* tables.exposedCommandOutbox
        .encodeRow({ ...publication, commandResolution })
        .pipe(Effect.orDie);
      tx.insert(schema.exposedCommandOutbox).values(row).run();
    } else {
      const row =
        yield* aggregateAgentProjectionDbConfig.tables.exposedCommandOutbox
          .encodeRow(publication)
          .pipe(Effect.orDie);
      tx.insert(aggregateAgentProjectionDbConfig.schema.exposedCommandOutbox)
        .values(row)
        .run();
    }
    tx.insert(schema.materializationHead)
      .values({ singletonId: 1, ...checkpoint })
      .onConflictDoUpdate({
        target: schema.materializationHead.singletonId,
        set: checkpoint,
      })
      .run();

    cursor = aggregateIndex;
    dispositionChainHash = nextDispositionChainHash;
    previousSelectedResources = nextSelectedResources;
  }
});
