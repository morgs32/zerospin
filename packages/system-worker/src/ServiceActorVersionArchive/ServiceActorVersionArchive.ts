import { makeServiceExposedCommand } from '@zerospin/core/serviceSession/makeServiceExposedCommand';
import { ServiceExposedCommandSchema } from '@zerospin/core/serviceSession/ServiceSessionWireSchema';
import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { DurableObject } from 'cloudflare:workers';
import { desc } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import type { IServiceOutcomeOwner } from '../ServiceActorVersionChain/serviceActorOutcomeOwner.js';
import { serviceActorVersionChainName } from '../ServiceActorVersionChain/serviceActorVersionChainName.js';
import type { IServiceProjectionKey } from '../serviceProjection/resolveServiceActorView.js';
import {
  serviceProjectionDbConfig,
  type IServiceExposedPublication,
} from '../serviceProjection/serviceProjectionDbConfig.js';
import { authoredReleaseRepoRuntime } from '../workerConfiguration/workerConfiguration.js';

import {
  readServiceActorPublication,
  readServiceActorPublicationPage,
  readServiceActorResolutionSummary,
  type IServiceActorArchivePage,
  type IServiceActorResolutionSummary,
} from './serviceActorArchiveStorage.js';
import { serviceActorVersionArchiveDbConfig } from './serviceActorVersionArchiveDbConfig.js';
import { serviceActorVersionArchiveName } from './serviceActorVersionArchiveName.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

const nonnegativeIndex = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
const positiveIndex = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);

function isStorageFull(error: unknown) {
  let cause = error;
  while (cause instanceof Error && cause.cause instanceof Error) {
    cause = cause.cause;
  }
  return cause instanceof Error && /\bSQLITE_FULL\b/u.test(cause.message);
}

/** One immutable public/private history range; its source Chain selects successors. */
export class ServiceActorVersionArchive extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'ServiceActorVersionArchive',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_ACTOR_VERSION_ARCHIVE',
    migratableDORepoConfig: makeMigratableDORepoConfig({
      migrations: [],
      ...serviceActorVersionArchiveName,
      dbConfig: serviceActorVersionArchiveDbConfig,
    }),
  },
) {
  #readTip() {
    return (
      this.db
        .select({ serviceIndex: this.schema.exposedCommands.serviceIndex })
        .from(this.schema.exposedCommands)
        .orderBy(desc(this.schema.exposedCommands.serviceIndex))
        .limit(1)
        .get()?.serviceIndex ?? this.key.firstServiceIndex - 1
    );
  }

  async appendExposedCommands(props: {
    sourceKey: IServiceProjectionKey;
    commands: readonly IServiceExposedPublication[];
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { sourceKey, commands } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            sourceKey: Schema.toType(serviceActorVersionChainName.keyCodec),
            commands: Schema.Array(
              Schema.toType(
                serviceProjectionDbConfig.tables.exposedCommandOutbox.codec,
              ),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'exposed-command-invalid',
            prefix: 'Invalid archived Service Actor publication',
          }),
        );
        const { firstServiceIndex, ...boundSource } = this.key;
        if (!isEqual(sourceKey, boundSource)) {
          return yield* makeZerospinError('projection-history-source-mismatch');
        }
        for (const publication of commands) {
          yield* Schema.decodeUnknownEffect(
            Schema.toType(ServiceExposedCommandSchema),
          )(makeServiceExposedCommand(publication)).pipe(
            mapParseError({
              code: 'exposed-command-invalid',
              prefix: 'Invalid archived Service Actor output',
            }),
          );
        }
        yield* Effect.try({
          try: () =>
            this.db.transaction(tx => {
              let tip = this.#readTip();
              let prior = 0;
              for (const publication of commands) {
                if (
                  !Number.isSafeInteger(publication.serviceIndex) ||
                  publication.serviceIndex < firstServiceIndex ||
                  publication.serviceIndex <= prior
                ) {
                  throw makeZerospinError(
                    'service-actor-version-archive-command-invalid',
                  );
                }
                prior = publication.serviceIndex;
                const retained = readServiceActorPublication(
                  tx,
                  publication.serviceIndex,
                );
                if (retained !== null) {
                  if (!isEqual(retained, publication)) {
                    throw makeZerospinError('exposed-command-conflict');
                  }
                  continue;
                }
                if (publication.serviceIndex !== tip + 1) {
                  throw makeZerospinError('exposed-command-index-gap');
                }
                const { commandResolution, ...command } = publication;
                tx.insert(this.schema.exposedCommands)
                  .values(
                    Schema.encodeSync(
                      serviceActorVersionArchiveDbConfig.tables.exposedCommands
                        .codec,
                    )(command),
                  )
                  .run();
                if (commandResolution !== null) {
                  tx.insert(this.schema.commandResolutions)
                    .values(
                      Schema.encodeSync(
                        serviceActorVersionArchiveDbConfig.tables
                          .commandResolutions.codec,
                      )({
                        serviceIndex: publication.serviceIndex,
                        ...commandResolution,
                      }),
                    )
                    .run();
                }
                tip = publication.serviceIndex;
              }
            }),
          catch: error =>
            isStorageFull(error)
              ? makeZerospinError({
                  code: 'service-actor-version-archive-full',
                  extra: { lastServiceIndex: this.#readTip() },
                })
              : ensureZerospinError({
                  code: 'service-actor-version-archive-append-failed',
                  error,
                }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getExposedCommand(props: {
    serviceIndex: number;
  }): Promise<
    IRpcEnvelope<IServiceExposedPublication | null, IZerospinErrorJson>
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { serviceIndex } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ serviceIndex: positiveIndex }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'service-projection-checkpoint-invalid',
            prefix: 'Invalid Archive checkpoint',
          }),
        );
        return yield* Effect.try({
          try: () => readServiceActorPublication(this.db, serviceIndex),
          catch: error =>
            ensureZerospinError({
              code: 'service-actor-version-archive-read-failed',
              error,
            }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getPage(
    props: IServiceActorArchivePage,
  ): Promise<
    IRpcEnvelope<
      { rows: readonly IServiceExposedPublication[]; lastIndex: number },
      IZerospinErrorJson
    >
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const page = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            afterIndex: nonnegativeIndex,
            maxIndex: Schema.optional(nonnegativeIndex),
            nodeId: Schema.optional(Schema.NonEmptyString),
            afterPushIndex: Schema.optional(nonnegativeIndex),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'session-replay-cursor-invalid',
            prefix: 'Invalid Archive page',
          }),
        );
        if (
          (page.nodeId === undefined) !== (page.afterPushIndex === undefined) ||
          (page.maxIndex !== undefined && page.maxIndex < page.afterIndex)
        ) {
          return yield* makeZerospinError('session-replay-cursor-invalid');
        }
        return yield* Effect.try({
          try: () => {
            const lastIndex = this.#readTip();
            return readServiceActorPublicationPage(
              this.db,
              {
                ...page,
                afterIndex: Math.max(
                  page.afterIndex,
                  this.key.firstServiceIndex - 1,
                ),
                maxIndex: Math.min(lastIndex, page.maxIndex ?? lastIndex),
              },
              lastIndex,
            );
          },
          catch: error =>
            ensureZerospinError({
              code: 'service-actor-version-archive-read-failed',
              error,
            }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getResolutionSummary(props: {
    owner: IServiceOutcomeOwner;
    throughServiceIndex: number;
    afterServiceIndex?: number;
  }): Promise<
    IRpcEnvelope<IServiceActorResolutionSummary, IZerospinErrorJson>
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const request = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            owner: Schema.Struct({
              actorName: Schema.String,
              actorVersion: positiveIndex,
              sessionName: Schema.String,
              claims: Schema.Record(Schema.String, Schema.Unknown),
              nodeId: Schema.NullOr(Schema.NonEmptyString),
            }),
            throughServiceIndex: nonnegativeIndex,
            afterServiceIndex: Schema.optional(nonnegativeIndex),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'node-recovery-checkpoint-invalid',
            prefix: 'Invalid Archive resolution bound',
          }),
        );
        if (
          request.owner.actorName !== this.key.actorName ||
          request.owner.actorVersion !== this.key.actorVersion
        ) {
          return yield* makeZerospinError('node-recovery-caller-mismatch');
        }
        return yield* Effect.try({
          try: () => readServiceActorResolutionSummary(this.db, request),
          catch: error =>
            ensureZerospinError({
              code: 'service-actor-version-archive-read-failed',
              error,
            }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }
}
