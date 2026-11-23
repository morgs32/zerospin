import '@zerospin/server-only';
import {
  encodeError,
  ensureZerospinError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { IAnyAggregateRelease } from '../../aggregate/types.ts';
import type { QuerySelection } from '../../models/make/makeQueryDbVersion.ts';
import { ReadQueryResultSchema } from '../../models/reads/ReadQuerySchema.ts';
import type { IAnyServiceRelease } from '../../service/types.ts';
import type { ISystemApiRpc } from '../../systemApi/ISystemApiRpc.ts';
import type { IApi, IApiFailure } from '../getApi/getApi.ts';

import {
  prepareSystemAggregateCommand,
  type ISystemAggregateCommandInput,
} from './prepareSystemAggregateCommand.ts';
import {
  prepareSystemServiceCommand,
  type ISystemServiceCommandInput,
} from './prepareSystemServiceCommand.ts';

/** Construct typed administrative methods over an acquired Effect capability. */
export function makeSystemApi(props: { rpc: IApi<ISystemApiRpc> }) {
  const { rpc } = props;
  return {
    healthcheck: rpc.healthcheck,
    initialize: rpc.initialize,
    executeServiceQuery: Effect.fn('SystemApi.executeServiceQuery')(function* <
      TResult,
    >(props: {
      serviceName: string;
      serviceVersion: number;
      query: QuerySelection<TResult>;
    }) {
      const { serviceName, serviceVersion, query } = props;
      return yield* Effect.gen(function* () {
        const read = yield* Effect.try({
          try: () => query.prepareRead(),
          catch: error =>
            ensureZerospinError({ code: 'service-query-invalid', error }),
        });
        const response = yield* rpc.executeServiceQuery({
          serviceName,
          serviceVersion,
          ...read.request,
        });
        const result = yield* Schema.decodeUnknownEffect(ReadQueryResultSchema)(
          response,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'rpc-invalid-response',
            prefix: 'Service query returned an invalid read result',
          }),
        );
        if (
          result.compilerVersion !== read.compilerVersion ||
          !isEqual(result.layout, read.layout)
        ) {
          return yield* makeZerospinError({
            code: 'service-query-result-mismatch',
            message:
              'Service query compiler or projection layout differs from the local selection.',
          });
        }
        return yield* Effect.try({
          try: () => read.mapRows(result.rows),
          catch: error =>
            ensureZerospinError({
              code: 'service-query-result-invalid',
              error,
            }),
        });
      }).pipe(
        Effect.catch(
          (failure): Effect.Effect<never, IApiFailure> =>
            isZerospinError(failure)
              ? encodeError(failure).pipe(Effect.flatMap(Effect.fail))
              : Effect.fail(failure),
        ),
      );
    }),
    executeAggregateCommand<
      RELEASE extends IAnyAggregateRelease,
      NAME extends keyof RELEASE['system'] & string,
    >(release: RELEASE, input: ISystemAggregateCommandInput<RELEASE, NAME>) {
      const prepared = prepareSystemAggregateCommand(release, input);
      return Effect.flatMap(prepared, command =>
        rpc.executeAggregateCommand({ command }),
      ).pipe(
        Effect.catch(failure =>
          isZerospinError(failure)
            ? encodeError(failure).pipe(Effect.flatMap(Effect.fail))
            : Effect.fail(failure),
        ),
        Effect.withSpan('SystemApi.executeAggregateCommand'),
      );
    },
    executeServiceCommand<
      RELEASE extends IAnyServiceRelease,
      NAME extends keyof RELEASE['system'] & string,
    >(release: RELEASE, input: ISystemServiceCommandInput<RELEASE, NAME>) {
      const prepared = prepareSystemServiceCommand(release, input);
      return Effect.flatMap(prepared, command =>
        rpc.executeServiceCommand({ command }),
      ).pipe(
        Effect.catch(failure =>
          isZerospinError(failure)
            ? encodeError(failure).pipe(Effect.flatMap(Effect.fail))
            : Effect.fail(failure),
        ),
        Effect.withSpan('SystemApi.executeServiceCommand'),
      );
    },
    getRepoRegistrations: rpc.getRepoRegistrations,
    getRepoTableRows: rpc.getRepoTableRows,
    preflightDeployment: rpc.preflightDeployment,
    acceptSystemSpec: rpc.acceptSystemSpec,
    getExecutingWorkerVersion: rpc.getExecutingWorkerVersion,
    makeSystemSpec: rpc.makeSystemSpec,
    openAggregateAgentSession: rpc.openAggregateAgentSession,
    openServiceAgentSession: rpc.openServiceAgentSession,
    getAgentAggregateIds: rpc.getAgentAggregateIds,
    executeAggregateQuery: Effect.fn('SystemApi.executeAggregateQuery')(
      function* <TResult>(props: {
        aggregateName: string;
        aggregateVersion: number;
        aggregateId: string;
        query: QuerySelection<TResult>;
      }) {
        const { aggregateName, aggregateVersion, aggregateId, query } = props;
        return yield* Effect.gen(function* () {
          const read = yield* Effect.try({
            try: () => query.prepareRead(),
            catch: error =>
              ensureZerospinError({ code: 'aggregate-query-invalid', error }),
          });
          const response = yield* rpc.executeAggregateQuery({
            aggregateName,
            aggregateVersion,
            aggregateId,
            ...read.request,
          });
          const result = yield* Schema.decodeUnknownEffect(
            ReadQueryResultSchema,
          )(response, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'rpc-invalid-response',
              prefix: 'Aggregate query returned an invalid read result',
            }),
          );
          if (
            result.compilerVersion !== read.compilerVersion ||
            !isEqual(result.layout, read.layout)
          ) {
            return yield* makeZerospinError({
              code: 'aggregate-query-result-mismatch',
              message:
                'Aggregate query compiler or projection layout differs from the local selection.',
            });
          }
          return yield* Effect.try({
            try: () => read.mapRows(result.rows),
            catch: error =>
              ensureZerospinError({
                code: 'aggregate-query-result-invalid',
                error,
              }),
          });
        }).pipe(
          Effect.catch(
            (failure): Effect.Effect<never, IApiFailure> =>
              isZerospinError(failure)
                ? encodeError(failure).pipe(Effect.flatMap(Effect.fail))
                : Effect.fail(failure),
          ),
        );
      },
    ),
  };
}
