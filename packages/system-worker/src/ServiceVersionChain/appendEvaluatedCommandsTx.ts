import { operationCodecs } from '@zerospin/core/contracts/operationCodecs';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';

import { resolveWorkContract } from '../externalOperations/resolveWorkContract.js';
import {
  advanceDispositionChainHash,
  genesisDispositionChainHash,
} from '../serviceDispositionChainHash/serviceDispositionChainHash.js';

import {
  encodeServiceCommandProvenance,
  EvaluatedServiceCommandSchema,
  type IEvaluatedServiceCommand,
} from './evaluatedServiceCommand.js';
import { serviceVersionChainDbConfig } from './serviceVersionChainDbConfig.js';

const { commands: commandsTable } = serviceVersionChainDbConfig.schema;
/** Commit new immutable output after the source has compared every retained-position retry. */
export const appendEvaluatedCommandsTx = makeTx(
  'ServiceVersionChain.appendEvaluatedCommandsTx',
)(function* (
  tx: ITx<typeof serviceVersionChainDbConfig>,
  props: {
    commands: readonly IEvaluatedServiceCommand[];
    serviceRelease: IAnyServiceRelease | undefined;
  },
) {
  const { serviceRelease, commands: inputCommands } = props;
  const commands = yield* Schema.decodeUnknownEffect(
    Schema.Array(Schema.toType(EvaluatedServiceCommandSchema)),
  )(inputCommands, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-evaluated-command-invalid',
      prefix: 'Invalid evaluated command',
    }),
  );
  const head = tx
    .select()
    .from(serviceVersionChainDbConfig.schema.historyHead)
    .where(eq(serviceVersionChainDbConfig.schema.historyHead.singletonId, 1))
    .get();
  let tip = head?.serviceIndex ?? 0;
  let previousDispositionChainHash =
    head?.dispositionChainHash ?? genesisDispositionChainHash();
  const archivedThrough =
    tx
      .select()
      .from(serviceVersionChainDbConfig.schema.archiveFanoutSubscribers)
      .where(
        eq(
          serviceVersionChainDbConfig.schema.archiveFanoutSubscribers
            .singletonId,
          1,
        ),
      )
      .get()?.acknowledgedServiceIndex ?? 0;
  const newCount = commands.filter(
    command => command.serviceIndex > tip,
  ).length;
  if (newCount > 64) {
    return yield* makeZerospinError(
      'service-evaluated-command-batch-too-large',
    );
  }
  if (tip - archivedThrough + newCount > 64) {
    return yield* makeZerospinError('service-version-archive-backlog-full');
  }
  let previousCommandIndex = 0;
  for (const command of commands) {
    if (command.serviceIndex <= previousCommandIndex) {
      return yield* makeZerospinError(
        'service-evaluated-command-order-invalid',
      );
    }
    previousCommandIndex = command.serviceIndex;
    if (
      serviceRelease !== undefined &&
      command.serviceName !== serviceRelease.name
    ) {
      return yield* makeZerospinError(
        'service-evaluated-command-owner-mismatch',
      );
    }
    const emittedCommandIds = new Set<string>();
    if (
      command.outcome.result._tag === 'Failure' &&
      command.operations.length > 0
    ) {
      return yield* makeZerospinError(
        'service-evaluated-command-operations-invalid',
      );
    }
    let previous = -1;
    for (const operation of command.operations) {
      if (operation.operationIndex <= previous) {
        return yield* makeZerospinError(
          'service-evaluated-command-operations-invalid',
        );
      }
      previous = operation.operationIndex;
      if (operation.operationName === 'command') {
        if (emittedCommandIds.has(operation.command.command.id)) {
          return yield* makeZerospinError('command-operation-id-duplicate');
        }
        emittedCommandIds.add(operation.command.command.id);
        continue;
      }
      if (operation.operationName === 'external') {
        if (emittedCommandIds.has(operation.externalCommandId)) {
          return yield* makeZerospinError(
            'service-evaluated-command-operations-invalid',
          );
        }
        yield* resolveWorkContract(serviceRelease, operation);
        emittedCommandIds.add(operation.externalCommandId);
        continue;
      }
      const model = serviceRelease?.models[operation.modelName];
      if (model === undefined || model.version !== operation.modelVersion) {
        return yield* makeZerospinError(
          'service-evaluated-command-model-invalid',
        );
      }
      const codecs = operationCodecs(model).operations;
      yield* Schema.decodeUnknownEffect(
        Schema.Union([
          codecs.create,
          codecs.update,
          codecs.delete,
          codecs.move,
        ]),
      )(
        {
          modelName: operation.modelName,
          modelVersion: operation.modelVersion,
          resourceId: operation.resourceId,
          operationName: operation.operationName,
          body: operation.body,
        },
        { onExcessProperty: 'error' },
      ).pipe(
        mapParseError({
          code: 'service-evaluated-command-operations-invalid',
          prefix: 'Invalid model operation in evaluated command',
        }),
      );
    }
    if (command.serviceIndex !== tip + 1) {
      return yield* makeZerospinError('service-execution-history-gap');
    }
    if (
      command.dispositionChainHash !==
      advanceDispositionChainHash({
        previousDispositionChainHash,
        serviceIndex: command.serviceIndex,
        commandId: command.id,
        outcome: command.outcome,
      })
    ) {
      return yield* makeZerospinError('service-evaluated-command-invalid');
    }
    const row = yield* serviceVersionChainDbConfig.tables.commands
      .encodeRow({ ...command, ...encodeServiceCommandProvenance(command) })
      .pipe(
        mapParseError({
          code: 'service-evaluated-command-invalid',
          prefix: 'Invalid evaluated command row',
        }),
      );
    tx.insert(commandsTable).values(row).run();
    tip = command.serviceIndex;
    previousDispositionChainHash = command.dispositionChainHash;
    tx.insert(serviceVersionChainDbConfig.schema.historyHead)
      .values({
        singletonId: 1,
        serviceIndex: tip,
        commandId: command.id,
        dispositionChainHash: previousDispositionChainHash,
      })
      .onConflictDoUpdate({
        target: serviceVersionChainDbConfig.schema.historyHead.singletonId,
        set: {
          serviceIndex: tip,
          commandId: command.id,
          dispositionChainHash: previousDispositionChainHash,
        },
      })
      .run();
  }
});
