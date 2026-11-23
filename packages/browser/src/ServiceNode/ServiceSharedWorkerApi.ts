import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget, type RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { BrowserRpc } from '../Node/BrowserRpc.ts';

import { attach } from './attach/attach.ts';
import { ready } from './ready/ready.ts';
import type { IServiceNodeUpgradeJournal } from './recoverServiceTabJournal.ts';
import type {
  IServiceBrowserSessionApi,
  ServiceBrowserSessionApi,
} from './ServiceBrowserSessionApi.ts';
import { ServiceNodeRequestSchema } from './serviceNodeRequest.ts';
export const ServiceAttachmentSchema = Schema.Struct({
  request: ServiceNodeRequestSchema,
  expectedClaims: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  retryConnection: Schema.optional(Schema.Literal(true)),
  newSessionAttempt: Schema.optional(Schema.Literal(true)),
});

export type IServiceSharedWorkerHost = {
  ready(): Promise<{ version: string; artifactUrl: string }>;
  attach(
    attachment: typeof ServiceAttachmentSchema.Type,
    getAdmission: () => Promise<IAdmissionRequest>,
    signal: AbortSignal,
    recoveryNotice?: (error: IZerospinErrorJson) => Promise<void>,
    journalBootstrap?: IServiceNodeUpgradeJournal,
  ): Promise<ServiceBrowserSessionApi>;
};

export class ServiceSharedWorkerApi extends RpcTarget {
  #disposed = false;
  #connections = new Set<() => void>();
  #host;
  #lifetime = new AbortController();

  constructor(host: IServiceSharedWorkerHost) {
    super();
    this.#host = host;
  }

  async ready() {
    return BrowserRpc.run(
      ready({ disposed: this.#disposed, ready: () => this.#host.ready() }),
    );
  }

  async attach(
    input: unknown,
    admission: RpcStub<() => Promise<IAdmissionRequest>>,
    recoveryNotice?: RpcStub<(error: IZerospinErrorJson) => Promise<void>>,
    journalBootstrap?: RpcStub<IServiceNodeUpgradeJournal>,
  ): Promise<RpcStub<IServiceBrowserSessionApi>> {
    return BrowserRpc.run(
      Schema.decodeUnknownEffect(ServiceAttachmentSchema)(input, {
        onExcessProperty: 'error',
      }).pipe(
        Effect.orDie,
        Effect.flatMap(attachment =>
          attach({
            attachment,
            admission,
            recoveryNotice,
            journalBootstrap,
            host: this.#host,
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
