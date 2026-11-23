import { makeZerospinError, type IAnyError } from '@zerospin/error';
import type { Query } from 'drizzle-orm';
import { Cause, Effect } from 'effect';
import { mapValues } from 'es-toolkit';

import { applyOperationTx } from '../contracts/applyOperationTx.ts';
import { decodeAndAdaptPayload } from '../contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts';
import {
  evaluatePreparedContract,
  isAggregateContract,
  isOrdinaryContract,
  isServiceContract,
} from '../contracts/make/constructContractRelease.ts';
import { scopeContractReadDb } from '../contracts/make/makeContractReadDb.ts';
import { prepareAggregateInvocation } from '../contracts/prepare/prepareAggregateInvocation.ts';
import { prepareServiceInvocation } from '../contracts/prepare/prepareServiceInvocation.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import { withCommandEvaluationClock } from '../contracts/withCommandEvaluationClock.ts';
import { quoteSqliteIdentifier } from '../drizzle/definition/compileSqliteTableDefinition.ts';
import type { ITx } from '../drizzle/types.ts';
import type { QuerySelection } from '../models/make/makeQueryDbVersion.ts';

import type { IAgentRelease } from './AgentReleaseSchema.ts';
import { localAgentMembership } from './compileAgentSelections.ts';
import { resolveAgentCommand } from './makeAgentCommandRef.ts';
import { bindAgentQueryDb } from './makeAgentWake.ts';
import type { IAgentStagedCommand } from './runAgentWake.ts';

export class AgentViewStorageError extends Error {
  constructor(cause: unknown) {
    super('Agent selected-view storage read failed', { cause });
  }
}

/** Bind the Agent's filtered model graph to the same SQL transaction used for staging. */
export function makeAgentStagingView(props: {
  agent: IAgentRelease;
  ownerContracts: IAnyContracts;
  physicalTableNames: Readonly<Record<string, string>>;
  read(
    tx: ITx,
    options?: {
      physicalTableNames: Readonly<Record<string, string>>;
      bind(query: Query): Query;
    },
  ): <RESULT>(query: QuerySelection<RESULT>) => RESULT;
}) {
  const { agent, ownerContracts, physicalTableNames, read } = props;
  const visibleNames = mapValues(
    agent.selections,
    (_selection, name) => `__agent_visible_${name}`,
  );
  const memberships = mapValues(agent.selections, selection =>
    localAgentMembership(selection, physicalTableNames),
  );
  const ctes = Object.values(
    mapValues(memberships, (query, name) => ({
      sql: `${quoteSqliteIdentifier(visibleNames[name]!)} as (${query.sql})`,
      params: query.params,
    })),
  );
  const optimistic = {
    physicalTableNames: visibleNames,
    bind(query: Query): Query {
      if (ctes.length === 0) return query;
      return {
        ...query,
        sql: `with ${ctes.map(cte => cte.sql).join(', ')} ${query.sql}`,
        params: [...ctes.flatMap(cte => cte.params), ...query.params],
      };
    },
  };

  const evaluate = Effect.fn('Agent.evaluateStagedCommand')(function* (
    tx: ITx,
    stage: IAgentStagedCommand,
    aggregateId: string | undefined,
  ) {
    const ref = agent.contracts[stage.commandName];
    const contract = resolveAgentCommand(ref, ownerContracts);
    if (
      contract === undefined ||
      contract.version !== stage.contractVersion ||
      !isOrdinaryContract(contract)
    ) {
      return yield* makeZerospinError('agent-contract-unavailable');
    }
    const payload = yield* decodeAndAdaptPayload(contract, { command: stage });
    const input = {
      id: stage.id,
      commandName: stage.commandName,
      contractVersion: stage.contractVersion,
      payload,
      agentVersion: agent.agentVersion,
      agentName: agent.agentName,
      externalOutcome: null,
    };
    const invocation =
      'aggregateName' in agent &&
      isAggregateContract(contract) &&
      aggregateId !== undefined
        ? yield* prepareAggregateInvocation({
            contract,
            command: {
              ...input,
              kind: 'agent',
              aggregateId,
              aggregateName: agent.aggregateName,
              aggregateVersion: agent.aggregateVersion,
            },
            claims: null,
          })
        : 'serviceName' in agent && isServiceContract(contract)
          ? yield* prepareServiceInvocation({
              contract,
              command: {
                ...input,
                kind: 'agent',
                serviceName: agent.serviceName,
                serviceVersion: agent.serviceVersion,
              },
              claims: null,
            })
          : yield* makeZerospinError('contract-family-mismatch');
    const selected = bindAgentQueryDb({
      modelsDb: agent.db,
      read: read(tx, optimistic),
    });
    const readDb = scopeContractReadDb(
      {
        read: (model, options, first) =>
          Effect.sync(() => {
            const query = selected.query[model.modelName];
            if (query === undefined) {
              throw new Error(`Undeclared Agent read model ${model.modelName}`);
            }
            return first
              ? query.findFirst(options).sync()
              : query.findMany(options).sync();
          }),
      },
      agent.db.models,
    );
    const appliedAt = new Date(stage.appliedAt);
    const made = yield* withCommandEvaluationClock(
      evaluatePreparedContract(invocation, readDb).pipe(Effect.scoped),
      appliedAt,
    );
    for (const operation of made.operations) {
      if (
        operation.operationName === 'external' ||
        operation.operationName === 'command'
      ) {
        continue;
      }
      const name = operation.model.modelName;
      if (!Object.hasOwn(memberships, name)) {
        return yield* makeZerospinError('agent-operation-model-out-of-scope');
      }
      if (operation.operationName !== 'create') {
        const membership = memberships[name]!;
        const visible = yield* Effect.try({
          try: () =>
            tx._.session
              .prepareQuery(
                {
                  sql: `SELECT id FROM (${membership.sql}) WHERE id = ? LIMIT 1`,
                  params: [...membership.params, operation.resourceId],
                },
                'arrays',
                false,
                'all',
              )
              .all(),
          catch: cause => new AgentViewStorageError(cause),
        }).pipe(Effect.orDie);
        if (!Array.isArray(visible) || visible.length === 0) {
          return yield* makeZerospinError('operation-row-not-found');
        }
      }
      yield* applyOperationTx({
        tx,
        operation,
        appliedAt,
        physicalTableName: physicalTableNames[name]!,
      }).pipe(
        Effect.catchCause((cause): Effect.Effect<never, IAnyError> => {
          const reason = cause.reasons[0];
          if (
            cause.reasons.length !== 1 ||
            reason === undefined ||
            !Cause.isDieReason(reason)
          ) {
            return Effect.failCause(cause);
          }
          const defect = reason.defect;
          const message =
            defect instanceof Error
              ? [
                  defect.message,
                  defect.cause instanceof Error
                    ? defect.cause.message
                    : defect.cause,
                ].join(' ')
              : String(defect);
          if (
            /unique constraint failed|sqlite_constraint_(?:unique|primarykey)/i.test(
              message,
            )
          ) {
            return Effect.fail(
              makeZerospinError('agent-operation-unique-conflict'),
            );
          }
          return Effect.die(new AgentViewStorageError(defect));
        }),
      );
    }
    return made.result;
  });

  return {
    read: (tx: ITx) => read(tx, optimistic),
    evaluate,
  };
}
