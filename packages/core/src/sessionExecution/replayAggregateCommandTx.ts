import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  getAggregateSessionContract,
  getAggregateSessionModels,
} from '../aggregateSession/executionDefinition.ts';
import type { IAggregateSessionDefinition } from '../aggregateSession/types.ts';
import { decodeAndAdaptPayload } from '../contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts';
import {
  evaluatePreparedContract,
  isOrdinaryContract,
} from '../contracts/make/constructContractRelease.ts';
import { makeContractReadDb } from '../contracts/make/makeContractReadDb.ts';
import { prepareAggregateInvocation } from '../contracts/prepare/prepareAggregateInvocation.ts';
import type { IAggregateSessionSubmissionInput } from '../contracts/types.ts';
import type { ITx } from '../drizzle/types.ts';
import type { IInverseOperation } from '../models/InverseOperationSchema.ts';

import { replayOptimisticCommandTx } from './replayOptimisticCommandTx.ts';
import type { IAggregateSessionReplayRequirements } from './requirements.ts';

/** Reevaluate captured Aggregate input without creating a command or an outcome. */
type IProps<
  D extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = {
  tx: ITx;
  definition: D;
  command: IAggregateSessionSubmissionInput<{
    commandName: string;
    contractVersion: number;
    payload: string;
  }>;
  aggregateId: string;
  claims: Readonly<Record<string, unknown>> | undefined;
  stagedAt: Date;
};

export function replayAggregateCommandTx<D extends IAggregateSessionDefinition>(
  props: IProps<D>,
): Effect.Effect<
  IInverseOperation[] | null,
  unknown,
  IAggregateSessionReplayRequirements<D>
>;
export function replayAggregateCommandTx(
  props: IProps,
): Effect.Effect<IInverseOperation[] | null, unknown, unknown> {
  return Effect.fn('replayAggregateCommandTx')(function* (
    props: IProps,
  ): Effect.fn.Return<IInverseOperation[] | null, unknown, unknown> {
    const {
      tx,
      definition,
      command,
      aggregateId,
      stagedAt,
      claims: inputClaims,
    } = props;
    if (command.aggregateId !== aggregateId) {
      return yield* makeZerospinError('aggregate-command-scope-mismatch');
    }
    const contract = getAggregateSessionContract(
      definition,
      command.commandName,
    );
    if (
      contract === undefined ||
      contract.commandName !== command.commandName ||
      contract.version !== command.contractVersion ||
      !isOrdinaryContract(contract)
    ) {
      return yield* makeZerospinError('pending-command-contract-missing');
    }
    const claims =
      'claimsSchema' in definition
        ? yield* Schema.decodeUnknownEffect(definition.claimsSchema)(
            inputClaims,
          )
        : undefined;
    const payload = yield* decodeAndAdaptPayload(contract, { command });
    return yield* replayOptimisticCommandTx({
      tx,
      contract,
      appliedAt: stagedAt,
      evaluate: tx =>
        Effect.gen(function* () {
          const invocation = yield* prepareAggregateInvocation({
            contract,
            command: { ...command, payload },
            claims,
          });
          return yield* evaluatePreparedContract(
            invocation,
            makeContractReadDb({
              db: tx,
              models: getAggregateSessionModels(definition),
            }),
          );
        }),
    });
  })(props);
}
