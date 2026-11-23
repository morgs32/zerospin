import { isZerospinError, makeZerospinError } from '@zerospin/error';
import { makeIdFromAbbreviation, type CuidFactory } from '@zerospin/shapes';
import { Cause, Clock, Effect, Exit, type Scope } from 'effect';

import { encodePayload } from '../contracts/encodePayload.ts';
import type {
  IAnyContracts,
  IInferContractExecutionRequirements,
} from '../contracts/types.ts';
import type { ITx } from '../drizzle/types.ts';
import { withSavepoint } from '../drizzle/withSavepoint.ts';

import type { IAgentRelease } from './AgentReleaseSchema.ts';
import { resolveAgentCommand } from './makeAgentCommandRef.ts';
import {
  AgentViewStorageError,
  type makeAgentStagingView,
} from './makeAgentStagingView.ts';
import {
  bindAgentQueryDb,
  type IAgentWakeCapabilities,
  type IAgentWakeRule,
} from './makeAgentWake.ts';
import type { pendingAgentWakesDbConfig } from './pendingAgentWakesDbConfig.ts';

export type IAgentStagedCommand = Omit<
  typeof pendingAgentWakesDbConfig.tables.pendingAgentCommands.codec.Type,
  'producerIndex'
>;

/** Reconstruct the selected optimistic view, run the wake, and retain only the successful command inputs. */
type IAgentWake<CONTRACTS extends IAnyContracts = IAnyContracts> = {
  tx: ITx;
  agent: IAgentRelease;
  ownerContracts: CONTRACTS;
  rule: IAgentWakeRule;
  scheduled: { resourceId: string; at: number };
  aggregateId?: string | undefined;
  view: ReturnType<typeof makeAgentStagingView>;
  pending: readonly IAgentStagedCommand[];
  enqueue(tx: ITx, command: IAgentStagedCommand): Effect.Effect<void, unknown>;
};

export function runAgentWake<CONTRACTS extends IAnyContracts>(
  props: IAgentWake<CONTRACTS>,
): Effect.Effect<
  void,
  unknown,
  keyof CONTRACTS extends never
    ? never
    :
        | CuidFactory
        | Exclude<
            IInferContractExecutionRequirements<CONTRACTS[keyof CONTRACTS]>,
            Scope.Scope
          >
>;
export function runAgentWake(props: IAgentWake) {
  return Effect.fn('Agent.runWake')(function* () {
    const {
      agent,
      scheduled,
      rule,
      ownerContracts,
      view,
      tx: wakeTx,
      pending,
      aggregateId,
      enqueue,
    } = props;
    const services = yield* Effect.context<unknown>();

    const stages: IAgentStagedCommand[] = [];
    const discardProjection = Symbol('discard Agent optimistic projection');
    yield* withSavepoint({
      tx: wakeTx,
      program: ({ tx }) =>
        Effect.gen(function* () {
          // A newly confirmed command may invalidate a prediction. Its original
          // delivery remains valid and the remaining predictions replay in order.
          for (const previous of pending) {
            yield* withSavepoint({
              tx,
              program: ({ tx }) => view.evaluate(tx, previous, aggregateId),
            }).pipe(
              Effect.catch(error => {
                if (
                  isZerospinError(error) &&
                  ('scope' in error ||
                    [
                      'agent-operation-unique-conflict',
                      'operation-row-not-found',
                      'operation-referential-integrity-failed',
                      'operation-move-precondition-failed',
                      'service-resource-deleted',
                    ].includes(error.code))
                ) {
                  return Effect.void;
                }
                return Effect.fail(error);
              }),
            );
          }
          const invoke = (programTx: ITx, failure?: Cause.Cause<unknown>) =>
            Effect.gen(function* () {
              let open = true;
              const ensureOpen = () => {
                if (!open) {
                  throw new Error('Agent wake capabilities are closed');
                }
              };
              const read = view.read(programTx);
              const db = bindAgentQueryDb({
                modelsDb: agent.db,
                read: query => {
                  ensureOpen();
                  return read(query);
                },
              });
              const stageCommand: IAgentWakeCapabilities['stageCommand'] = (
                ref,
                payload,
              ) =>
                Effect.gen(function* () {
                  ensureOpen();
                  if (!Object.is(agent.contracts[ref.commandName], ref)) {
                    return yield* makeZerospinError(
                      'agent-command-not-granted',
                    );
                  }
                  const contract = resolveAgentCommand(ref, ownerContracts);
                  if (contract === undefined) {
                    return yield* makeZerospinError(
                      'agent-contract-unavailable',
                    );
                  }
                  const stage = {
                    id: yield* makeIdFromAbbreviation({ abbreviation: 'cmd' }),
                    commandName: contract.commandName,
                    contractVersion: contract.version,
                    payload: yield* encodePayload(contract, {
                      version: contract.version,
                      payload,
                    }),
                    appliedAt: yield* Clock.currentTimeMillis,
                  };
                  const result = yield* withSavepoint({
                    tx: programTx,
                    program: ({ tx }) => view.evaluate(tx, stage, aggregateId),
                  });
                  stages.push(stage);
                  return result;
                }).pipe(Effect.provideContext(services));
              const context = {
                resourceId: scheduled.resourceId,
                at: scheduled.at,
                db,
                stageCommand,
              };
              try {
                if (failure === undefined) yield* rule.onWake.program(context);
                else yield* rule.onWake.onFailure({ ...context, failure });
              } finally {
                open = false;
              }
            });
          const program = yield* Effect.exit(
            withSavepoint({ tx, program: ({ tx }) => invoke(tx) }),
          );
          if (Exit.isFailure(program)) {
            stages.length = 0;
            if (
              program.cause.reasons.some(
                reason =>
                  Cause.isInterruptReason(reason) ||
                  (Cause.isDieReason(reason) &&
                    reason.defect instanceof AgentViewStorageError) ||
                  (Cause.isFailReason(reason) &&
                    isZerospinError(reason.error) &&
                    reason.error.code === 'drizzle-savepoint-failed'),
              )
            ) {
              return yield* Effect.failCause(program.cause);
            }
            yield* invoke(tx, program.cause);
          }
          return yield* Effect.fail(discardProjection);
        }),
    }).pipe(
      Effect.catchIf(
        error => error === discardProjection,
        () => Effect.void,
      ),
    );
    for (const stage of stages) yield* enqueue(wakeTx, stage);
  })();
}
