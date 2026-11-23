import {
  encodeError,
  ensureZerospinError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import type { CuidFactory } from '@zerospin/shapes';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';
import * as Semaphore from 'effect/Semaphore';

import { getSelectedServiceAgentReleases } from '../../agent/getSelectedServiceAgentReleases.ts';
import { buildCommandContinuation } from '../../contracts/buildCommandContinuation.ts';
import { makeSystemServiceCommandId } from '../../contracts/commandIds.ts';
import {
  UnknownAggregateCommandSchema,
  UnknownServiceCommandSchema,
} from '../../contracts/CommandSchema.ts';
import { makeOwnerReleaseLayerProvider } from '../../execution/provideReleaseLayer.ts';
import type { QuerySelection } from '../../models/make/makeQueryDbVersion.ts';
import { executeQuerySelection } from '../../models/reads/executeQuerySelection.ts';
import { System } from '../../system/System.ts';
import type { ISystem } from '../../system/types.ts';
import { prepareSystemServiceCommand } from '../../utils/getSystemApi/prepareSystemServiceCommand.ts';
import { UlidMonotonicFactory } from '../../utils/UlidMonotonicFactory.ts';

import type { IQueuedHarnessWork } from './executionTypes.ts';
import { makeHarnessExecutor } from './makeHarnessExecutor.ts';
import { makeHarnessStores } from './makeHarnessStores.ts';
import { makeHarnessAgents } from './reconcileHarnessAgents.ts';
import { runHarnessExternal } from './runHarnessExternal.ts';
import type {
  ISystemHarness,
  ISystemHarnessApi,
  ISystemHarnessCommand,
  ISystemHarnessOwner,
} from './types.ts';

type IHarnessOptions<
  SYSTEM extends ISystem,
  SERVICES,
  REQUIREMENTS,
> = Readonly<{
  system: SYSTEM;
  layer?: (
    api: ISystemHarnessApi,
  ) => Layer.Layer<SERVICES, IAnyError, REQUIREMENTS>;
}>;

/** A scoped local host for authored System behavior, with no distributed runtime. */
export function makeSystemHarness<
  SYSTEM extends ISystem,
  SERVICES = never,
  REQUIREMENTS = never,
>(
  props: IHarnessOptions<SYSTEM, SERVICES, REQUIREMENTS>,
): Effect.Effect<
  ISystemHarness<SYSTEM>,
  IAnyError,
  Scope.Scope | CuidFactory | Exclude<REQUIREMENTS, System>
>;
export function makeSystemHarness(
  props: IHarnessOptions<ISystem, never, unknown>,
): Effect.Effect<ISystemHarness<ISystem>, IAnyError, unknown> {
  return Effect.gen(function* () {
    const { system, layer } = props;
    const caller = yield* Effect.context<unknown>();
    const framework = yield* Layer.build(UlidMonotonicFactory);
    let context = Context.add(Context.merge(framework, caller), System, system);
    const provideReleaseLayer = makeOwnerReleaseLayerProvider(
      yield* Effect.scope,
    );
    const stores = yield* makeHarnessStores(system);
    const agents = yield* makeHarnessAgents(system, provideReleaseLayer);
    const queryExecution = yield* Semaphore.make(1);
    const flushing = yield* Semaphore.make(1);
    const queue: IQueuedHarnessWork[] = [];
    let flushExecutions: number | null = null;

    const countExecution = (invocation: string) =>
      Effect.suspend(() => {
        if (flushExecutions === null) {
          return Effect.void;
        }
        if (flushExecutions >= 1000) {
          return makeZerospinError({
            code: 'system-harness-work-limit',
            message: 'flush exceeded 1,000 executions.',
            extra: { pending: queue.length, invocation },
          });
        }
        flushExecutions += 1;
        return Effect.void;
      });

    const executor = makeHarnessExecutor({
      system,
      stores,
      queue,
      countExecution,
      agents,
      provideReleaseLayer,
    });

    const directServicePositions = new Map<string, number>();
    const api: ISystemHarnessApi = {
      executeServiceCommand: (release, input) => {
        const prepared = prepareSystemServiceCommand(release, input);
        return Effect.gen(function* () {
          const encoded = yield* prepared;
          if (
            system.services[release.name]?.releases[release.version] !== release
          ) {
            return yield* makeZerospinError(
              'system-harness-owner-unregistered',
            );
          }
          const position = (directServicePositions.get(release.name) ?? 0) + 1;
          directServicePositions.set(release.name, position);
          const command = yield* executor.decodeCommand({
            ...encoded,
            id: makeSystemServiceCommandId(system.name, release.name, position),
          });
          const execution = yield* executor.execute(command);
          return execution.outcome;
        }).pipe(
          Effect.catch(error =>
            encodeError(error).pipe(Effect.flatMap(Effect.fail)),
          ),
          Effect.provide(context),
        );
      },
      executeServiceQuery: input =>
        queryExecution
          .withPermits(1)(
            Effect.gen(function* () {
              const release =
                system.services[input.serviceName]?.releases[
                  input.serviceVersion
                ];
              if (release === undefined) {
                return yield* makeZerospinError(
                  'system-harness-owner-unregistered',
                );
              }
              const store = yield* stores.get({ release });
              return yield* executeQuerySelection({
                db: store.db,
                models: release.models,
                selection: input.query,
              });
            }),
          )
          .pipe(
            Effect.catch(error =>
              encodeError(error).pipe(Effect.flatMap(Effect.fail)),
            ),
            Effect.provide(context),
          ),
    };

    if (layer !== undefined) {
      const app = yield* Layer.build(layer(api)).pipe(Effect.provide(context));
      context = Context.merge(context, app);
    }

    const push = (input: ISystemHarnessCommand) =>
      Effect.gen(function* () {
        const command = yield* Effect.gen(function* () {
          if ('aggregateName' in input) {
            return yield* Schema.decodeUnknownEffect(
              UnknownAggregateCommandSchema,
            )(input, { onExcessProperty: 'error' });
          }
          return yield* Schema.decodeUnknownEffect(UnknownServiceCommandSchema)(
            input,
            { onExcessProperty: 'error' },
          );
        }).pipe(
          Effect.mapError(() =>
            makeZerospinError('system-harness-command-invalid'),
          ),
        );
        const execution = yield* executor.execute(command);
        if (Exit.isFailure(execution.exit)) {
          return yield* Effect.failCause(execution.exit.cause);
        }
        return execution.exit.value;
      }).pipe(Effect.provide(context));

    const flush = () =>
      flushing
        .withPermits(1)(
          Effect.gen(function* () {
            flushExecutions = 0;
            for (const { release } of getSelectedServiceAgentReleases(system)) {
              yield* stores.get({ release });
            }
            while (true) {
              while (queue.length > 0) {
                const work = queue[0];
                if (work === undefined) {
                  break;
                }
                if (work.kind === 'external') {
                  yield* runHarnessExternal({
                    work,
                    executor,
                    countExecution,
                    provideReleaseLayer,
                  });
                } else if (work.kind === 'command') {
                  const destination = yield* executor.execute(
                    yield* executor.decodeCommand(work.command.command),
                  );
                  const continuation = yield* provideReleaseLayer(
                    work.store.release,
                    buildCommandContinuation(work.store.release, {
                      recorded: work.command,
                      outcome: destination.outcome,
                    }),
                  );
                  if (continuation !== null) {
                    yield* executor.executeContinuation(
                      work.store,
                      continuation,
                    );
                  }
                } else {
                  yield* executor.execute(work.command);
                }
                queue.shift();
              }
              yield* agents.reconcile(stores.list(), queue);
              if (queue.length === 0) return;
            }
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                flushExecutions = null;
              }),
            ),
          ),
        )
        .pipe(
          Effect.provide(context),
          Effect.mapError(error =>
            ensureZerospinError({
              code: 'system-harness-execution-failed',
              error,
            }),
          ),
        );

    const query = <A>(
      owner: ISystemHarnessOwner<ISystem>,
      selection: QuerySelection<A>,
    ) =>
      Effect.gen(function* () {
        const store = yield* stores.get(owner);
        return yield* executeQuerySelection({
          db: store.db,
          models: store.release.models,
          selection,
        });
      }).pipe(Effect.provide(context));

    return { push, flush, query };
  });
}
