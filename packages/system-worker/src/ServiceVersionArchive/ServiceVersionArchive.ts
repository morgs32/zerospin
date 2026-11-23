import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { DurableObject } from 'cloudflare:workers';
import { desc, eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { makeMigratableDORepo } from '../makeMigratableDORepo/makeMigratableDORepo.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import {
  makeWorkerRpcEnvelope,
  runWorkerInvocation,
} from '../runWorkerInvocation/runWorkerInvocation.js';
import {
  encodeServiceCommandProvenance,
  EvaluatedServiceCommandSchema,
  type IEvaluatedServiceCommand,
} from '../ServiceVersionChain/evaluatedServiceCommand.js';
import {
  decodeServiceHistoryCommand,
  readServiceCommandPage,
} from '../ServiceVersionChain/readServiceCommandPage.js';
import { authoredReleaseRepoRuntime } from '../workerConfiguration/workerConfiguration.js';

import { serviceVersionArchiveDbConfig } from './serviceVersionArchiveDbConfig.js';
import { serviceVersionArchiveName } from './serviceVersionArchiveName.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

function isStorageFull(error: unknown) {
  let cause = error;
  while (cause instanceof Error && cause.cause instanceof Error) {
    cause = cause.cause;
  }
  return cause instanceof Error && /\bSQLITE_FULL\b/u.test(cause.message);
}

/** One immutable physical range; its ServiceVersionChain owns successor selection. */
export class ServiceVersionArchive extends makeMigratableDORepo(
  DurableObject<Cloudflare.Env>,
  {
    repoType: 'ServiceVersionArchive',
    getConfiguredSystemId: authoredReleaseRepoRuntime.getConfiguredSystemId,
    getSystemSpecHash: authoredReleaseRepoRuntime.getSystemSpecHash,
    get managedRuntime() {
      return authoredReleaseRepoRuntime.managedRuntime;
    },
    runInvocation: runWorkerInvocation,
    encodeRpcOutcome: makeWorkerRpcEnvelope,
    namespaceBinding: 'SERVICE_VERSION_ARCHIVE',
    migratableDORepoConfig: makeMigratableDORepoConfig({
      migrations: [],
      ...serviceVersionArchiveName,
      dbConfig: serviceVersionArchiveDbConfig,
    }),
  },
) {
  #readTip() {
    return (
      this.db
        .select({ serviceIndex: this.schema.commands.serviceIndex })
        .from(this.schema.commands)
        .orderBy(desc(this.schema.commands.serviceIndex))
        .limit(1)
        .get()?.serviceIndex ?? this.key.firstServiceIndex - 1
    );
  }

  async appendEvaluatedCommands(props: {
    commands: readonly IEvaluatedServiceCommand[];
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { commands } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            commands: Schema.Array(
              Schema.toType(EvaluatedServiceCommandSchema),
            ),
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'service-evaluated-command-invalid',
            prefix: 'Invalid archived evaluated command',
          }),
        );
        yield* Effect.try({
          try: () =>
            this.db.transaction(tx => {
              let tip = this.#readTip();
              let prior = 0;
              for (const command of commands) {
                if (
                  command.serviceName !== this.key.serviceName ||
                  command.serviceIndex < this.key.firstServiceIndex ||
                  command.serviceIndex <= prior
                ) {
                  throw makeZerospinError(
                    'service-version-archive-command-invalid',
                  );
                }
                prior = command.serviceIndex;
                const stored = tx
                  .select()
                  .from(this.schema.commands)
                  .where(
                    eq(this.schema.commands.serviceIndex, command.serviceIndex),
                  )
                  .get();
                if (stored !== undefined) {
                  if (
                    !isEqual(
                      decodeServiceHistoryCommand(
                        serviceVersionArchiveDbConfig,
                        stored,
                      ),
                      command,
                    )
                  ) {
                    throw makeZerospinError(
                      'service-evaluated-command-mismatch',
                    );
                  }
                  continue;
                }
                if (command.serviceIndex !== tip + 1) {
                  throw makeZerospinError(
                    'service-version-archive-history-gap',
                  );
                }
                const row = Schema.encodeSync(
                  serviceVersionArchiveDbConfig.tables.commands.codec,
                )({ ...command, ...encodeServiceCommandProvenance(command) });
                tx.insert(this.schema.commands).values(row).run();
                tip = command.serviceIndex;
              }
            }),
          catch: error =>
            isStorageFull(error)
              ? makeZerospinError({
                  code: 'service-version-archive-full',
                  extra: { lastServiceIndex: this.#readTip() },
                })
              : ensureZerospinError({
                  code: 'service-version-archive-append-failed',
                  error,
                }),
        });
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getEvaluatedCommand(props: {
    serviceIndex: number;
  }): Promise<
    IRpcEnvelope<IEvaluatedServiceCommand | null, IZerospinErrorJson>
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const { serviceIndex } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            serviceIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThan(0),
            ),
          }),
        )(props).pipe(
          mapParseError({
            code: 'service-result-cursor-invalid',
            prefix: 'Invalid Archive cursor',
          }),
        );
        const row = this.db
          .select()
          .from(this.schema.commands)
          .where(eq(this.schema.commands.serviceIndex, serviceIndex))
          .get();
        return row === undefined
          ? null
          : decodeServiceHistoryCommand(serviceVersionArchiveDbConfig, row);
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }

  async getPage(props: {
    afterIndex: number;
    maxIndex?: number;
  }): Promise<
    IRpcEnvelope<
      { rows: readonly IEvaluatedServiceCommand[]; lastIndex: number },
      IZerospinErrorJson
    >
  > {
    return authoredReleaseRepoRuntime.managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const page = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            afterIndex: Schema.Number.check(
              Schema.isInt(),
              Schema.isGreaterThanOrEqualTo(0),
            ),
            maxIndex: Schema.optional(
              Schema.Number.check(
                Schema.isInt(),
                Schema.isGreaterThanOrEqualTo(0),
              ),
            ),
          }),
        )(props).pipe(
          mapParseError({
            code: 'fanout-page-invalid',
            prefix: 'Invalid Archive page',
          }),
        );
        const lastIndex = this.#readTip();
        return {
          rows: readServiceCommandPage({
            db: this.db,
            dbConfig: serviceVersionArchiveDbConfig,
            afterIndex: Math.max(
              page.afterIndex,
              this.key.firstServiceIndex - 1,
            ),
            maxIndex: Math.min(lastIndex, page.maxIndex ?? lastIndex),
          }).map(entry => entry.row),
          lastIndex,
        };
      }).pipe(effect => makeWorkerRpcEnvelope(effect)),
    );
  }
}
