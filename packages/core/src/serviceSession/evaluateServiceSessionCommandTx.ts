import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';

import { decodeAndAdaptPayload } from '../contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts';
import { encodeCommand } from '../contracts/encodeCommand.ts';
import { encodeFailure, type IFailure } from '../contracts/failureCodec.ts';
import {
  evaluatePreparedContract,
  isOrdinaryContract,
} from '../contracts/make/constructContractRelease.ts';
import { makeContractReadDb } from '../contracts/make/makeContractReadDb.ts';
import { prepareServiceInvocation } from '../contracts/prepare/prepareServiceInvocation.ts';
import {
  encodeContractResult,
  resolveContractResult,
} from '../contracts/resultCodec.ts';
import type {
  IInferContractExecutionRequirements,
  IInferContractResult,
  IServiceContractRelease,
} from '../contracts/types.ts';
import type { ITx } from '../drizzle/types.ts';
import type { IInverseOperation } from '../models/InverseOperationSchema.ts';
import type { IServiceNodeCommand } from '../ServiceNode/types.ts';
import { applyOptimisticOperationsTx } from '../sessionExecution/applyOptimisticOperationsTx.ts';
import { evaluateSynchronousSavepoint } from '../sessionExecution/evaluateSynchronousSavepoint.ts';

import type { IServiceSessionDefinition } from './types.ts';

type IProps<
  CONTRACT extends IServiceContractRelease = IServiceContractRelease,
> = {
  tx: ITx;
  definition: IServiceSessionDefinition;
  contract: CONTRACT;
  payload: unknown;
  claims: Readonly<Record<string, unknown>>;
};
type IEvaluatedServiceSessionCommand<
  CONTRACT extends IServiceContractRelease = IServiceContractRelease,
> = {
  command: Omit<
    IServiceNodeCommand,
    'sessionId' | 'sessionIndex' | 'id' | 'nodeId' | 'nodeIndex' | 'pushIndex'
  >;
  result: IInferContractResult<CONTRACT>;
  inverseOperations: IInverseOperation[];
};

/** Evaluate and apply once; capture suspension before the owning transaction rolls back. */
export function evaluateServiceSessionCommandTx<
  CONTRACT extends IServiceContractRelease,
>(
  props: IProps<CONTRACT>,
): Effect.Effect<
  IEvaluatedServiceSessionCommand<CONTRACT>,
  IAnyError | IFailure,
  Exclude<IInferContractExecutionRequirements<CONTRACT>, Scope.Scope>
>;
export function evaluateServiceSessionCommandTx(
  props: IProps,
): Effect.Effect<
  IEvaluatedServiceSessionCommand,
  IAnyError | IFailure,
  unknown
> {
  return Effect.fn('evaluateServiceSessionCommandTx')(function* (
    props: IProps,
  ) {
    const { tx, definition, contract, payload, claims } = props;
    const evaluation = Effect.gen(function* () {
      if (!isOrdinaryContract(contract)) {
        return yield* makeZerospinError('external-contract-kind-mismatch');
      }
      const command = yield* encodeCommand({
        contract,
        command: {
          commandName: contract.commandName,
          contractVersion: contract.version,
          payload,
          claims: yield* Schema.encodeEffect(definition.claimsSchema)(
            claims,
          ).pipe(
            mapParseError({
              code: 'service-session-claims-invalid',
              prefix: 'Invalid service session claims',
            }),
          ),
          serviceName: definition.serviceName,
          kind: 'actor',
          actorName: definition.actorName,
          actorVersion: definition.actorVersion,
          sessionName: definition.sessionName,
        },
      });
      const decodedPayload = yield* decodeAndAdaptPayload(contract, {
        command,
      });
      const invocation = yield* prepareServiceInvocation({
        contract,
        command: { ...command, payload: decodedPayload },
        claims,
      });
      const made = yield* evaluatePreparedContract(
        invocation,
        makeContractReadDb({ db: tx, models: definition.models }),
      );
      const encodedResult = yield* encodeContractResult(contract, made.result);
      const result = yield* resolveContractResult(contract, {
        ...command,
        result: encodedResult,
      });
      const completedAt = new Date().toISOString();
      const inverseOperations = yield* applyOptimisticOperationsTx({
        tx,
        operations: made.operations,
        operationsSchema: contract.operationsSchema,
        appliedAt: new Date(completedAt),
      });
      return {
        command: {
          ...command,
          stagingOutcome: {
            result: encodedResult,
            completedAt,
          },
        },
        result,
        inverseOperations,
      };
    }).pipe(
      Effect.catch(failure =>
        encodeFailure(contract, failure).pipe(Effect.flatMap(Effect.fail)),
      ),
    );
    return yield* evaluateSynchronousSavepoint({
      tx,
      program: () => Effect.scoped(evaluation),
    });
  })(props);
}
