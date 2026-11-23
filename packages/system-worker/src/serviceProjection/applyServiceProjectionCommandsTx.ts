import { applyDeferredOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeSelectedResourceDelta } from '@zerospin/core/models/reads/makeSelectedResourceDelta';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { makeZerospinError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../serviceDispositionChainHash/serviceDispositionChainHash.js';
import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';

import { prepareServiceProjectionOccurrence } from './prepareServiceProjectionOccurrence.js';
import { serviceProjectionDbConfig } from './serviceProjectionDbConfig.js';

export type IServiceSelectedPublication = {
  serviceIndex: number;
  dispositionChainHash: string;
  id: IEvaluatedServiceCommand['id'];
  commandName: string;
  delta: ReturnType<typeof makeSelectedResourceDelta>;
};

/** Apply complete Service execution in order; each view supplies only selection and private-publication ownership. */
export function applyServiceProjectionCommandsTx<E, R>(
  tx: ITx,
  props: {
    rows: readonly IEvaluatedServiceCommand[];
    serviceRelease: IAnyServiceRelease;
    key: { serviceName: string; serviceVersion: number };
    readResources: () => Effect.Effect<IEncodedResourceShape[], E, R>;
    publish: (
      output: IServiceSelectedPublication,
      command: IEvaluatedServiceCommand,
    ) => Effect.Effect<void, E, R>;
  },
) {
  const readResources = props.readResources.bind(props);
  const publish = props.publish.bind(props);
  const { rows, serviceRelease, key } = props;
  return Effect.gen(function* () {
    const { materializationHead, exposedCommandOutbox } =
      serviceProjectionDbConfig.schema;
    const head = tx
      .select()
      .from(materializationHead)
      .where(eq(materializationHead.singletonId, 1))
      .get();
    let cursor = head?.serviceIndex ?? 0;
    const freshCount = new Set(
      rows
        .filter(row => row.serviceIndex > cursor)
        .map(row => row.serviceIndex),
    ).size;
    if (freshCount > 64) {
      return yield* makeZerospinError(
        'service-projection-publication-batch-too-large',
      );
    }
    const pendingCount =
      tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(exposedCommandOutbox)
        .get()?.count ?? 0;
    if (pendingCount + freshCount > 64) {
      return yield* makeZerospinError(
        'service-projection-publication-backlog-full',
      );
    }
    let dispositionChainHash =
      head?.dispositionChainHash ?? genesisDispositionChainHash();
    let graph = yield* readResources();
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
    for (const input of rows) {
      const { command, operations } = yield* prepareServiceProjectionOccurrence(
        {
          input,
          serviceRelease,
          key,
        },
      );
      // ServiceVersionChain has fixed immutable evaluated command identity; committed positions cannot reapply resources.
      if (input.serviceIndex <= cursor) continue;
      if (input.serviceIndex !== cursor + 1) {
        return yield* makeZerospinError('service-projection-result-index-gap');
      }
      const nextHash = advanceDispositionChainHash({
        previousDispositionChainHash: dispositionChainHash,
        serviceIndex: input.serviceIndex,
        commandId: command.id,
        outcome: command.outcome,
      });
      if (nextHash !== command.dispositionChainHash) {
        return yield* makeZerospinError(
          'service-projection-disposition-chain-hash-mismatch',
        );
      }
      for (const { operation, appliedAt } of operations) {
        yield* applyDeferredOperationTx({
          tx,
          operation,
          appliedAt,
        });
      }
      const nextGraph = yield* readResources();
      const identities = new Set(
        nextGraph.map(resource => `${resource.modelName}\0${resource.id}`),
      );
      if (identities.size !== nextGraph.length) {
        return yield* makeZerospinError('service-projection-resource-conflict');
      }
      yield* publish(
        {
          serviceIndex: input.serviceIndex,
          dispositionChainHash: nextHash,
          id: command.id,
          commandName: command.commandName,
          delta: makeSelectedResourceDelta({
            before: graph,
            after: nextGraph,
          }),
        },
        command,
      );
      tx.insert(materializationHead)
        .values({
          singletonId: 1,
          serviceIndex: input.serviceIndex,
          dispositionChainHash: nextHash,
        })
        .onConflictDoUpdate({
          target: materializationHead.singletonId,
          set: {
            serviceIndex: input.serviceIndex,
            dispositionChainHash: nextHash,
          },
        })
        .run();
      graph = nextGraph;
      cursor = input.serviceIndex;
      dispositionChainHash = nextHash;
    }
  });
}
