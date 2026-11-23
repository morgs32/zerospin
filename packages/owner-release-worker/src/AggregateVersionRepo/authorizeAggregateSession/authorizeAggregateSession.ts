import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { ICommandOutcome } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { DirectSystemAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { getOperationLeaves } from '@zerospin/core/contracts/operationSchema';
import type { ICommand } from '@zerospin/core/contracts/types';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import { runAuthoredCallback } from '@zerospin/core/execution/runAuthoredCallback';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { validateAggregateSessionLock } from '@zerospin/system-worker/AggregateVersionRepo/authorizeAggregateSession/validateAggregateSessionLock';
import type { AggregateChains } from '@zerospin/system-worker/repoServices/AggregateChains';
import type { AggregateVersionRepos } from '@zerospin/system-worker/repoServices/AggregateVersionRepos';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/*
 * Admit an application session against this aggregate instance and release.
 *
 * 1. Select the Repo-owned aggregate release and validate the session lock.
 * 2. Decode actor claims and check aggregate instance membership.
 * 3. Build the aggregate-owned query surface.
 * 4. Invoke the actor authorizer and return the checked session spec.
 */
export const authorizeAggregateSession = Effect.fn(
  'AggregateVersionRepo.authorizeAggregateSession',
)(function* (props: {
  systemId: string;
  aggregateId: string;
  aggregateName: string;
  aggregateVersion: number;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  aggregateSessionLock: IAggregateSessionLock;
  db: IDb;
  // Only actual admission backpressure from this framework callback escapes
  // authored-refusal normalization; an authored error code grants no exemption.
  executeDirectSystemAggregateCommand(props: {
    systemId: string;
    command: typeof DirectSystemAggregateCommandSchema.Type;
  }): Effect.Effect<
    ICommandOutcome,
    unknown,
    AggregateChains | AggregateVersionRepos
  >;
}) {
  const {
    aggregateId,
    aggregateName,
    aggregateVersion,
    sessionName,
    aggregateSessionLock,
    db,
    claims: suppliedClaims,
    executeDirectSystemAggregateCommand,
    systemId,
  } = props;

  const system = yield* System;

  // 1 — resolve the release and validate the exact actor and declaration lock
  const aggregateRegistry = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });
  const aggregateRelease = yield* getByKeyOrThrow({
    record: aggregateRegistry.releases,
    key: aggregateVersion,
    recordKind: 'listed versions',
  });
  const { actor, sessionSpec } = yield* validateAggregateSessionLock({
    aggregateRelease,
    sessionName,
    aggregateSessionLock,
  });

  // 2 — claims validation applies even to the default authorizer
  const claims = yield* Schema.decodeUnknownEffect(actor.identity.claimsSchema)(
    suppliedClaims,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'authorization-claims-invalid',
      prefix: 'Invalid actor claims',
    }),
  );
  if (claims.aggregateId !== aggregateId) {
    return yield* makeZerospinError('actor-capability-mismatch');
  }

  // 3 — expose only model queries owned by this aggregate release
  const query = Object.create(null);
  for (const modelName of Object.keys(aggregateRelease.models)) {
    const modelQuery = Reflect.get(db.query, modelName);
    if (modelQuery === undefined) {
      return yield* makeZerospinError({
        code: 'aggregate-authorization-readable-query-required',
        message: `Aggregate authorization cannot resolve model query "${modelName}"`,
        extra: { aggregateName, sessionName, modelName },
      });
    }
    Reflect.set(query, modelName, modelQuery);
  }

  // 4 — custom and default authorizers share the same invocation
  const context = yield* Effect.context<unknown>();
  const admissionBackpressure = new Set<unknown>();
  yield* Effect.suspend(() =>
    actor.authorize({
      aggregateId,
      sessionName,
      claims,
      db: { query },
      executeCommand: Effect.fn('authorization.executeCommand')(function* (
        requested: Omit<ICommand, 'id'>,
      ) {
        const command = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            commandName: Schema.String,
            contractVersion: VersionSchema,
            payload: Schema.Unknown,
          }),
        )(requested, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'authorization-command-invalid',
            prefix: 'Invalid authorization command',
          }),
        );
        const contract = yield* getByKeyOrThrow({
          record: aggregateRelease.system,
          key: command.commandName,
          recordKind: 'aggregate System grants',
        });
        if (contract.version !== command.contractVersion) {
          return yield* makeZerospinError({
            code: 'authorization-command-invalid',
            message: `Contract ${command.commandName}@${command.contractVersion} is not registered on this release`,
          });
        }
        if (contract.external !== undefined) {
          return yield* makeZerospinError('authorization-command-external');
        }
        if (
          contract.claims !== undefined ||
          getOperationLeaves(contract.operations).some(
            operation =>
              operation.operationName === 'external' &&
              (aggregateRelease.external[operation.contractName]?.version !==
                operation.contractVersion ||
                aggregateRelease.external[operation.contractName]?.external
                  ?.definition.externalOperation !== operation ||
                aggregateRelease.external[operation.contractName]?.claims !==
                  undefined),
          )
        ) {
          return yield* makeZerospinError(
            'authorization-command-claims-required',
          );
        }
        const payload = yield* encodePayload(contract, {
          version: command.contractVersion,
          payload: command.payload,
        });
        return yield* executeDirectSystemAggregateCommand({
          systemId,
          command: {
            ...command,
            payload,
            aggregateId,
            aggregateName,
            aggregateVersion,
            kind: 'system',
          },
        }).pipe(
          Effect.tapError(error =>
            Effect.sync(() => {
              if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === 'aggregate-admission-backlog-full'
              ) {
                admissionBackpressure.add(error);
              }
            }),
          ),
        );
      }),
    }),
  ).pipe(
    Effect.provideContext(context),
    program => provideReleaseLayer(aggregateRelease, program),
    Effect.catchCause(cause => {
      const reason = cause.reasons[0];
      if (
        cause.reasons.length === 1 &&
        reason !== undefined &&
        Cause.isFailReason(reason) &&
        admissionBackpressure.has(reason.error)
      ) {
        return Effect.failCause(cause);
      }
      return runAuthoredCallback({
        program: Effect.failCause(cause),
        code: 'aggregate-authorization-failed',
      });
    }),
  );
  return sessionSpec;
}, Effect.scoped);
