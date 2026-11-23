import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { isAggregateExternalContractDefinition } from '../../contracts/defineAggregateExternalContract.ts';
import { isServiceExternalContractDefinition } from '../../contracts/defineServiceExternalContract.ts';
import { isExternalContract } from '../../contracts/make/constructContractRelease.ts';
import { prepareCommandOperation } from '../../contracts/prepareCommandOperation.ts';
import type { IContractOutput } from '../../contracts/types.ts';

import type {
  IHarnessStore,
  IHarnessWork,
  IPreparedHarnessOutput,
} from './executionTypes.ts';
import type { ISystemHarnessCommand } from './types.ts';

/** Freeze outgoing work without publishing it before the owning model transaction commits. */
export const prepareHarnessOutput = Effect.fn('prepareHarnessOutput')(
  function* (props: {
    store: IHarnessStore;
    command: ISystemHarnessCommand;
    extension?: true;
    operations: readonly IContractOutput[];
  }) {
    const { store, command, extension, operations } = props;
    const work: IHarnessWork[] = [];
    const modelOperations: {
      operation: IPreparedHarnessOutput['modelOperations'][number]['operation'];
      operationIndex: number;
    }[] = [];

    for (const [operationIndex, operation] of operations.entries()) {
      if (operation.operationName === 'command') {
        work.push({
          kind: 'command',
          command: yield* prepareCommandOperation({
            operation,
            sourceRelease: store.release,
            declaration: {
              commandName: command.commandName,
              ...(extension ? { extension } : {}),
            },
          }),
          store,
        });
        continue;
      }
      if (operation.operationName !== 'external') {
        modelOperations.push({ operation, operationIndex });
        continue;
      }

      const contract = operation.contract;
      const registered = store.release.external[contract.commandName];
      if (
        registered === undefined ||
        registered.version !== contract.version ||
        !isExternalContract(registered) ||
        registered.external.definition !== contract
      ) {
        return yield* makeZerospinError('external-emission-unregistered');
      }
      const encoded = yield* Effect.gen(function* () {
        if (
          store.kind === 'aggregate' &&
          isAggregateExternalContractDefinition(contract)
        ) {
          return yield* Schema.encodeEffect(contract.externalOperation.schema)(
            { ...operation, contract },
            { onExcessProperty: 'error' },
          );
        }
        if (
          store.kind === 'service' &&
          isServiceExternalContractDefinition(contract)
        ) {
          return yield* Schema.encodeEffect(contract.externalOperation.schema)(
            { ...operation, contract },
            { onExcessProperty: 'error' },
          );
        }
        return yield* makeZerospinError('external-emission-unregistered');
      }).pipe(
        Effect.updateContext<never, never>(() => Context.empty()),
        mapParseError({
          code: 'external-operation-invalid',
          prefix: 'Invalid frozen external operation',
        }),
      );
      const payload = yield* Schema.decodeUnknownEffect(Schema.Json)(
        encoded.payload,
      ).pipe(
        mapParseError({
          code: 'external-payload-json-invalid',
          prefix: 'External payload must encode as JSON',
        }),
      );
      work.push({
        kind: 'external',
        store,
        contract: registered,
        payload,
        id: yield* makeIdFromAbbreviation({ abbreviation: 'cmd' }),
      });
    }
    return { modelOperations, work } satisfies IPreparedHarnessOutput;
  },
);
