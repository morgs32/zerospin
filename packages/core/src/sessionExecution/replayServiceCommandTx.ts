import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { decodeAndAdaptPayload } from '../contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts';
import {
  evaluatePreparedContract,
  isOrdinaryContract,
} from '../contracts/make/constructContractRelease.ts';
import { makeContractReadDb } from '../contracts/make/makeContractReadDb.ts';
import { prepareServiceInvocation } from '../contracts/prepare/prepareServiceInvocation.ts';
import type { ITx } from '../drizzle/types.ts';
import type { IInverseOperation } from '../models/InverseOperationSchema.ts';
import type { IServiceNodeCommand } from '../ServiceNode/types.ts';
import type { IServiceSessionDefinition } from '../serviceSession/types.ts';

import { replayOptimisticCommandTx } from './replayOptimisticCommandTx.ts';
import type { IServiceSessionReplayRequirements } from './requirements.ts';

/** Reevaluate captured Service input without creating a command or an outcome. */
type IProps<D extends IServiceSessionDefinition = IServiceSessionDefinition> = {
  tx: ITx;
  definition: D;
  command: Omit<
    IServiceNodeCommand,
    | 'sessionId'
    | 'sessionIndex'
    | 'id'
    | 'nodeId'
    | 'nodeIndex'
    | 'pushIndex'
    | 'stagingOutcome'
  >;
  claims: Readonly<Record<string, unknown>>;
  stagedAt: Date;
};

export function replayServiceCommandTx<D extends IServiceSessionDefinition>(
  props: IProps<D>,
): Effect.Effect<
  IInverseOperation[] | null,
  unknown,
  IServiceSessionReplayRequirements<D>
>;
export function replayServiceCommandTx(
  props: IProps,
): Effect.Effect<IInverseOperation[] | null, unknown, unknown> {
  return Effect.fn('replayServiceCommandTx')(function* (
    props: IProps,
  ): Effect.fn.Return<IInverseOperation[] | null, unknown, unknown> {
    const { tx, definition, command, stagedAt, claims: inputClaims } = props;
    const contract = definition.contracts[command.commandName];
    if (
      contract === undefined ||
      contract.commandName !== command.commandName ||
      contract.version !== command.contractVersion ||
      !isOrdinaryContract(contract)
    ) {
      return yield* makeZerospinError('pending-command-contract-missing');
    }
    const claims = yield* Schema.decodeUnknownEffect(definition.claimsSchema)(
      inputClaims,
    );
    const payload = yield* decodeAndAdaptPayload(contract, { command });
    return yield* replayOptimisticCommandTx({
      tx,
      contract,
      appliedAt: stagedAt,
      evaluate: tx =>
        Effect.gen(function* () {
          const invocation = yield* prepareServiceInvocation({
            contract,
            command: { ...command, payload },
            claims,
          });
          return yield* evaluatePreparedContract(
            invocation,
            makeContractReadDb({ db: tx, models: definition.models }),
          );
        }),
    });
  })(props);
}
