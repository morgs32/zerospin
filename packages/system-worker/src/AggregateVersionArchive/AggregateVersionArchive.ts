import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { DurableObject } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  readAggregateArchiveTip,
  readLocalAggregateHistoryCommand,
  readLocalAggregateHistoryPage,
} from '../AggregateVersionChain/aggregateHistoryStorage.js';
import {
  EvaluatedAggregateCommandSchema,
  type IEvaluatedAggregateCommand,
} from '../AggregateVersionChain/evaluatedAggregateCommand.js';
import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import { authoredReleaseRepoRuntime } from '../workerConfiguration/workerConfiguration.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

import { aggregateVersionArchiveDbConfig } from './aggregateVersionArchiveDbConfig.js';
import { aggregateVersionArchiveName } from './aggregateVersionArchiveName.js';
import { appendEvaluatedCommandsTx } from './appendEvaluatedCommandsTx.js';

function isStorageFull(error: unknown) {
  let cause = error;
  while (cause instanceof Error && cause.cause instanceof Error) {
    cause = cause.cause;
  }
  return cause instanceof Error && /\bSQLITE_FULL\b/u.test(cause.message);
}

/** Physical immutable evaluated history; the source Chain owns Archive routing and delivery progress. */
export class AggregateVersionArchive extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'AggregateVersionArchive',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'AGGREGATE_VERSION_ARCHIVE',
    migratableDORepoConfig: makeMigratableDORepoConfig({
      migrations: [],
      ...aggregateVersionArchiveName,
      dbConfig: aggregateVersionArchiveDbConfig,
    }),
  },
) {
  async appendEvaluatedCommands(props: {
    commands: readonly IEvaluatedAggregateCommand[];
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { commands } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            commands: Schema.Array(
              Schema.toType(EvaluatedAggregateCommandSchema),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'aggregate-version-archive-command-invalid',
            prefix: 'Invalid Archive publication',
          }),
        );
        if (
          commands.some(
            command =>
              command.aggregateName !== this.key.aggregateName ||
              command.aggregateId !== this.key.aggregateId,
          )
        ) {
          return yield* makeZerospinError(
            'aggregate-version-archive-owner-mismatch',
          );
        }
        yield* Effect.try({
          try: () =>
            appendEvaluatedCommandsTx(this.db, {
              commands,
              firstAggregateIndex: this.key.firstAggregateIndex,
            }),
          catch: error =>
            isStorageFull(error)
              ? makeZerospinError({
                  code: 'aggregate-version-archive-full',
                  extra: {
                    lastAggregateIndex: readAggregateArchiveTip(
                      aggregateVersionArchiveDbConfig,
                      this.db,
                      this.key.firstAggregateIndex,
                    ),
                  },
                })
              : ensureZerospinError({
                  code: 'aggregate-version-archive-append-failed',
                  error,
                }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getEvaluatedCommand(props: {
    aggregateIndex: number;
  }): Promise<
    IRpcEnvelope<IEvaluatedAggregateCommand | null, IZerospinErrorJson>
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.try({
        try: () => {
          const { aggregateIndex } = Schema.decodeUnknownSync(
            Schema.Struct({
              aggregateIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThan(0),
              ),
            }),
          )(props);
          return readLocalAggregateHistoryCommand(
            aggregateVersionArchiveDbConfig,
            this.db,
            aggregateIndex,
          );
        },
        catch: cause =>
          makeZerospinError({
            code: 'aggregate-version-archive-read-failed',
            cause: prettyUnknownFailure(cause),
          }),
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getPage(props: {
    afterIndex: number;
    maxIndex?: number;
  }): Promise<
    IRpcEnvelope<
      { rows: readonly IEvaluatedAggregateCommand[]; lastIndex: number },
      IZerospinErrorJson
    >
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.try({
        try: () => {
          const page = Schema.decodeUnknownSync(
            Schema.Struct({
              afterIndex: Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
              maxIndex: Schema.optionalKey(
                Schema.Number.check(
                  Schema.isInt(),
                  Schema.isGreaterThanOrEqualTo(0),
                ),
              ),
            }),
          )(props);
          const result = readLocalAggregateHistoryPage(
            aggregateVersionArchiveDbConfig,
            this.db,
            {
              ...page,
              afterIndex: Math.max(
                page.afterIndex,
                this.key.firstAggregateIndex - 1,
              ),
            },
            readAggregateArchiveTip(
              aggregateVersionArchiveDbConfig,
              this.db,
              this.key.firstAggregateIndex,
            ),
          );
          return {
            rows: result.rows.map(entry => entry.row),
            lastIndex: result.lastIndex,
          };
        },
        catch: cause =>
          makeZerospinError({
            code: 'aggregate-version-archive-read-failed',
            cause: prettyUnknownFailure(cause),
          }),
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }
}
