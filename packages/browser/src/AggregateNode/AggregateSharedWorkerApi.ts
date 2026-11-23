import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import type { IZerospinErrorJson } from '@zerospin/error';
import { TraceContextSchema, type ITelemetryBatch } from '@zerospin/logger';
import { RpcTarget, type RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { BrowserRpc } from '../Node/BrowserRpc.ts';

import type {
  AggregateBrowserSessionApi,
  IAggregateBrowserSessionApi,
} from './AggregateBrowserSessionApi.ts';
import { AggregateNodeRequestSchema } from './aggregateNodeRequest.ts';
import { attach } from './attach/attach.ts';
import { ready } from './ready/ready.ts';
import type { IAggregateNodeUpgradeJournal } from './recoverAggregateTabJournal.ts';
export const AggregateAttachmentSchema = Schema.Struct({
  request: AggregateNodeRequestSchema,
  expectedClaims: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  aggregateId: Schema.String,
  retryConnection: Schema.optional(Schema.Literal(true)),
  newSessionAttempt: Schema.optional(Schema.Literal(true)),
  diagnostics: Schema.optional(
    Schema.Struct({
      startupId: Schema.String,
      traceContext: Schema.NullOr(TraceContextSchema),
    }),
  ),
});

export type IAggregateSharedWorkerHost = {
  ready(): Promise<{ version: string; artifactUrl: string }>;
  attach(
    input: typeof AggregateAttachmentSchema.Type,
    getAdmission: () => Promise<IAggregateAuthenticationRequest>,
    signal: AbortSignal,
    telemetry?: {
      send(batch: ITelemetryBatch): Promise<void>;
      release(): void;
    },
    recoveryNotice?: (error: IZerospinErrorJson) => Promise<void>,
    journalBootstrap?: IAggregateNodeUpgradeJournal,
  ): Promise<AggregateBrowserSessionApi>;
};

export class AggregateSharedWorkerApi extends RpcTarget {
  #disposed = false;
  #connections = new Set<() => void>();
  #runtime;
  #lifetime = new AbortController();

  constructor(runtime: IAggregateSharedWorkerHost) {
    super();
    this.#runtime = runtime;
  }

  async ready() {
    return BrowserRpc.run(
      ready({ disposed: this.#disposed, ready: () => this.#runtime.ready() }),
    );
  }

  async attach(
    input: unknown,
    admission: RpcStub<() => Promise<IAggregateAuthenticationRequest>>,
    telemetry?: RpcStub<(batch: ITelemetryBatch) => Promise<void>>,
    recoveryNotice?: RpcStub<(error: IZerospinErrorJson) => Promise<void>>,
    journalBootstrap?: RpcStub<IAggregateNodeUpgradeJournal>,
  ): Promise<RpcStub<IAggregateBrowserSessionApi>> {
    return BrowserRpc.run(
      Schema.decodeUnknownEffect(AggregateAttachmentSchema)(input, {
        onExcessProperty: 'error',
      }).pipe(
        Effect.orDie,
        Effect.flatMap(attachment =>
          attach({
            attachment,
            admission,
            recoveryNotice,
            journalBootstrap,
            ...(telemetry === undefined ? {} : { telemetry }),
            runtime: this.#runtime,
            signal: this.#lifetime.signal,
            isDisposed: () => this.#disposed,
            connections: this.#connections,
          }),
        ),
      ),
    );
  }

  [Symbol.dispose]() {
    this.#disposed = true;
    this.#lifetime.abort();
    for (const close of this.#connections) close();
    this.#connections.clear();
  }
}
