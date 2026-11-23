import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { DurableObject } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import {
  appendLocalAggregateActorPublications,
  readLocalAggregateActorPage,
  readLocalAggregateActorPublication,
  readLocalAggregateActorTip,
  readLocalAggregateResolutionSummary,
  type IAggregateActorHistoryKey,
  type IAggregateActorPage,
  type IAggregateResolutionRequest,
  type IAggregateResolutionSummary,
} from '../AggregateActorVersionChain/aggregateActorHistoryStorage.js';
import { aggregateActorVersionChainName } from '../AggregateActorVersionChain/aggregateActorVersionChainName.js';
import {
  AggregateExposedPublicationSchema,
  type IAggregateExposedPublication,
} from '../aggregateSessionChain/aggregateExposedPublication.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { authoredReleaseRepoRuntime } from '../workerConfiguration/workerConfiguration.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

import { aggregateActorVersionArchiveDbConfig } from './aggregateActorVersionArchiveDbConfig.js';
import { aggregateActorVersionArchiveName } from './aggregateActorVersionArchiveName.js';

const nonnegativeIndex = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);

function isStorageFull(error: unknown) {
  let cause = error;
  while (cause instanceof Error && cause.cause instanceof Error) {
    cause = cause.cause;
  }
  return cause instanceof Error && /\bSQLITE_FULL\b/u.test(cause.message);
}

/** One immutable Actor-publication range; its source Chain owns rollover. */
export class AggregateActorVersionArchive extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'AggregateActorVersionArchive',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_ACTOR_VERSION_ARCHIVE',
    migratableDORepoConfig: makeMigratableDORepoConfig({
      migrations: [],
      ...aggregateActorVersionArchiveName,
      dbConfig: aggregateActorVersionArchiveDbConfig,
    }),
  },
) {
  async appendExposedCommands(props: {
    sourceKey: IAggregateActorHistoryKey;
    commands: readonly IAggregateExposedPublication[];
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { sourceKey, commands } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            sourceKey: Schema.toType(aggregateActorVersionChainName.keyCodec),
            commands: Schema.Array(
              Schema.toType(AggregateExposedPublicationSchema),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'exposed-command-invalid',
            prefix: 'Invalid archived Actor publication',
          }),
        );
        const { firstAggregateIndex, ...boundSource } = this.key;
        if (!isEqual(sourceKey, boundSource)) {
          return yield* makeZerospinError('projection-history-source-mismatch');
        }
        if (
          commands.some(command => command.aggregateIndex < firstAggregateIndex)
        ) {
          return yield* makeZerospinError('exposed-command-index-gap');
        }
        yield* Effect.try({
          try: () =>
            this.db.transaction(tx =>
              appendLocalAggregateActorPublications(
                tx,
                commands,
                readLocalAggregateActorTip(this.db, firstAggregateIndex),
              ),
            ),
          catch: error =>
            isStorageFull(error)
              ? makeZerospinError({
                  code: 'aggregate-actor-version-archive-full',
                  extra: {
                    lastAggregateIndex: readLocalAggregateActorTip(
                      this.db,
                      firstAggregateIndex,
                    ),
                  },
                })
              : ensureZerospinError({
                  code: 'aggregate-actor-version-archive-append-failed',
                  error,
                }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getExposedCommand(props: {
    aggregateIndex: number;
  }): Promise<
    IRpcEnvelope<IAggregateExposedPublication | null, IZerospinErrorJson>
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { aggregateIndex } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            aggregateIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThanOrEqualTo(this.key.firstAggregateIndex),
              Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'projection-history-checkpoint-invalid',
            prefix: 'Invalid Archive checkpoint',
          }),
        );
        return yield* Effect.try({
          try: () =>
            readLocalAggregateActorPublication(this.db, aggregateIndex),
          catch: error =>
            ensureZerospinError({
              code: 'aggregate-actor-version-archive-read-failed',
              error,
            }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getPage(props: IAggregateActorPage): Promise<
    IRpcEnvelope<
      {
        commands: readonly IAggregateExposedPublication[];
        scannedThrough: number;
      },
      IZerospinErrorJson
    >
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const page = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            afterAggregateIndex: Schema.optionalKey(nonnegativeIndex),
            afterScannedIndex: Schema.optionalKey(nonnegativeIndex),
            throughAggregateIndex: Schema.optionalKey(nonnegativeIndex),
            nodeId: Schema.optionalKey(Schema.NonEmptyString),
            afterPushIndex: Schema.optionalKey(nonnegativeIndex),
            limit: Schema.optionalKey(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThan(0),
                Schema.isLessThanOrEqualTo(64),
              ),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'session-replay-cursor-invalid',
            prefix: 'Invalid Archive page',
          }),
        );
        return yield* Effect.try({
          try: () =>
            readLocalAggregateActorPage(
              this.db,
              {
                ...page,
                afterScannedIndex: Math.max(
                  page.afterScannedIndex ?? 0,
                  this.key.firstAggregateIndex - 1,
                ),
              },
              Math.min(
                page.throughAggregateIndex ?? Number.MAX_SAFE_INTEGER,
                readLocalAggregateActorTip(
                  this.db,
                  this.key.firstAggregateIndex,
                ),
              ),
            ),
          catch: error =>
            ensureZerospinError({
              code: 'aggregate-actor-version-archive-read-failed',
              error,
            }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getResolutionSummary(
    props: IAggregateResolutionRequest,
  ): Promise<IRpcEnvelope<IAggregateResolutionSummary, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const request = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            nodeId: Schema.NonEmptyString,
            sessionName: Schema.String,
            claims: Schema.Record(Schema.String, Schema.Unknown),
            throughAggregateIndex: nonnegativeIndex,
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'node-recovery-checkpoint-invalid',
            prefix: 'Invalid Archive resolution bound',
          }),
        );
        return yield* Effect.try({
          try: () => readLocalAggregateResolutionSummary(this.db, request),
          catch: error =>
            ensureZerospinError({
              code: 'aggregate-actor-version-archive-read-failed',
              error,
            }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }
}
