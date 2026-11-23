import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import { RelationalQueryBuilder } from 'drizzle-orm/sqlite-core/query-builders/query';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type {
  IContractReadOptions,
  IContractReadResult,
  IExactContractReadOptions,
} from '../contracts/make/makeContractReadDb.ts';
import type {
  IContractRelease,
  IInferContractResult,
} from '../contracts/types.ts';
import {
  QuerySelection,
  type IAnyQueryDbVersion,
} from '../models/make/makeQueryDbVersion.ts';
import type {
  IAnyModels,
  IEncodedResourceShape,
  IInferPayloadInput,
  IResourceIdString,
} from '../models/types.ts';
import { makeEncodedRowFromResource } from '../Node/resourceEnvelope.ts';

import type { IAgentCommandRef } from './makeAgentCommandRef.ts';

export type IAgentQueryDb<MODELS extends IAnyModels = IAnyModels> = Readonly<{
  query: {
    readonly [K in keyof MODELS & string]: {
      findMany<const Q extends IContractReadOptions<MODELS, K> = {}>(
        options?: Q & IExactContractReadOptions<MODELS, K, NoInfer<Q>>,
      ): { sync(): IContractReadResult<MODELS, K, Q>[] };
      findFirst<const Q extends IContractReadOptions<MODELS, K> = {}>(
        options?: Q & IExactContractReadOptions<MODELS, K, NoInfer<Q>>,
      ): { sync(): IContractReadResult<MODELS, K, Q> | undefined };
    };
  };
}>;

/** Construct reads with the Agent's model declarations and run only on its selected rows. */
export function bindAgentQueryDb(props: {
  modelsDb: IAnyQueryDbVersion;
  read<RESULT>(query: QuerySelection<RESULT>): RESULT;
}) {
  const query = mapValues(props.modelsDb.query, builder => {
    if (!(builder instanceof RelationalQueryBuilder)) {
      throw new Error('Invalid Agent query database');
    }
    function bind(query: unknown) {
      if (!(query instanceof QuerySelection)) {
        throw new Error('Invalid Agent read');
      }
      return { sync: () => props.read(query) };
    }
    return {
      findMany: (options: Record<string, unknown> = {}) =>
        bind(builder.findMany(options)),
      findFirst: (options: Record<string, unknown> = {}) =>
        bind(builder.findFirst(options)),
    };
  });
  return { query };
}

export type IAgentWakeCapabilities<MODELS extends IAnyModels = IAnyModels> =
  Readonly<{
    db: IAgentQueryDb<MODELS>;
    stageCommand<CONTRACT extends IContractRelease>(
      ref: IAgentCommandRef<CONTRACT>,
      payload: IInferPayloadInput<NoInfer<CONTRACT['payload']>>,
    ): Effect.Effect<IInferContractResult<CONTRACT>, unknown>;
  }>;

type IWakeCallback<PROPS> = Readonly<{
  program(props: PROPS): Effect.Effect<void, unknown>;
  onFailure(
    props: PROPS & { readonly failure: unknown },
  ): Effect.Effect<void, unknown>;
}>;

export type IAuthoredWakeRules<MODELS extends IAnyModels> = Readonly<
  Record<
    string,
    {
      [K in keyof MODELS & string]: Readonly<{
        selection: K;
        wakeAt(props: {
          row: MODELS[K]['table']['codec']['Type'];
          db: IAgentQueryDb<MODELS>;
        }): number | null;
        onWake: IWakeCallback<
          IAgentWakeCapabilities<MODELS> & {
            resourceId: IResourceIdString<MODELS[K]['abbreviation']>;
            at: number;
          }
        >;
      }>;
    }[keyof MODELS & string]
  >
>;

export type IAgentWakeRule = Readonly<{
  modelName: string;
  wakeAt(props: {
    resource: IEncodedResourceShape;
    db: IAgentQueryDb;
  }): number | null;
  onWake: IWakeCallback<
    IAgentWakeCapabilities & { resourceId: string; at: number }
  >;
}>;

/** Decode the selected row for scheduling and the scheduled ID for invocation. */
export function compileAgentWake(
  model: IAnyModels[string],
  rule: IAuthoredWakeRules<IAnyModels>[string],
): IAgentWakeRule {
  const decodeId = Schema.decodeUnknownSync(
    makeAbbreviationIdSchema(model.abbreviation),
  );
  return {
    modelName: model.modelName,
    wakeAt: ({ resource, db }) => {
      const row = Schema.decodeUnknownSync(model.table.codec)(
        makeEncodedRowFromResource(resource, model),
      );
      const at = rule.wakeAt({ row, db });
      if (at !== null && !Number.isSafeInteger(at)) {
        throw new Error(
          'Agent wakeAt must return an integer timestamp or null',
        );
      }
      return at;
    },
    onWake: {
      program: context =>
        Effect.suspend(() =>
          rule.onWake.program({
            ...context,
            resourceId: decodeId(context.resourceId),
          }),
        ),
      onFailure: context =>
        Effect.suspend(() =>
          rule.onWake.onFailure({
            ...context,
            resourceId: decodeId(context.resourceId),
          }),
        ),
    },
  };
}
