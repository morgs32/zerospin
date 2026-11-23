import type {
  AggregateNode,
  IAggregateNodeSink,
} from '@zerospin/core/AggregateNode/AggregateNode';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { makeNodeSnapshotRequestSchema } from '@zerospin/core/Node/NodeSnapshotRequestSchema';
import { makeZerospinError } from '@zerospin/error';
import { RpcTarget, type RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { BrowserRpc } from '../Node/BrowserRpc.ts';
import { BrowserSessionPushPausedSchema } from '../Node/BrowserSessionPushPausedSchema.ts';
import { makeBrowserSessionSubscription } from '../Node/makeBrowserSessionSubscription.ts';
import { makeNodeCommandInterests } from '../Node/makeNodeCommandInterests.ts';
import { nodeRpcErrorFor } from '../Node/nodeRpcErrorFor.ts';
import { makeOutboxSubscriber } from '../outbox/makeOutboxSubscriber.ts';

import { dispose } from './dispose/dispose.ts';
import type { makeStandaloneWorkerRuntime } from './makeStandaloneWorkerRuntime.ts';
import { receiveCommandRows } from './receiveCommandRows.ts';
import type { encodeStandaloneClaims } from './standaloneIdentity.ts';
import { subscribe } from './subscribe/subscribe.ts';

export type IStandaloneSessionAttachment = {
  node: AggregateNode;
  boundNodeId: Awaited<
    ReturnType<AggregateNode['snapshot']>
  >['metadata']['nodeId'];
  claims: ReturnType<typeof encodeStandaloneClaims>['encoded'];
};

const SubscriptionSchema = makeNodeSnapshotRequestSchema(
  AggregateNodeCommandSchema,
);
const controlFailure = nodeRpcErrorFor([
  'node-tab-detached',
  'standalone-capability-stale',
]);

export class StandaloneBrowserSessionApi extends RpcTarget {
  private closed = false;
  readonly #interests = makeNodeCommandInterests<IAggregateNodeCommand>();
  private readonly subscription = makeBrowserSessionSubscription();

  constructor(
    private attachment: IStandaloneSessionAttachment,
    private drain: () => ReturnType<
      ReturnType<typeof makeStandaloneWorkerRuntime>['drainProgram']
    >,
    private push: (
      expectedNodeId: string,
    ) => ReturnType<
      ReturnType<typeof makeStandaloneWorkerRuntime>['pushProgram']
    >,
    private releaseSession: () => void,
  ) {
    super();
  }

  private check() {
    if (this.closed) throw makeZerospinError('node-tab-detached');
  }
  readonly #stagedCommandSubscriber = makeOutboxSubscriber({
    schema: AggregateNodeCommandSchema,
    check: () => this.check(),
    receive: async rows => {
      this.#interests.add(rows);
      const receipts = await receiveCommandRows({
        rows,
        attachment: this.attachment,
        check: () => this.check(),
        drain: () => BrowserRpc.run(this.drain()),
      });
      this.#interests.retained(receipts);
      return receipts;
    },
  });

  getStagedCommandSubscriber(input: unknown) {
    this.check();
    const expectedNodeId = Schema.decodeUnknownSync(Schema.NonEmptyString)(
      input,
    );
    if (expectedNodeId !== this.attachment.boundNodeId) {
      throw makeZerospinError('outbox-source-replaced');
    }
    return this.#stagedCommandSubscriber;
  }

  async subscribe(input: unknown, sink: RpcStub<Required<IAggregateNodeSink>>) {
    return BrowserRpc.run(
      Effect.try({
        try: () => {
          this.check();
          return Schema.decodeUnknownSync(SubscriptionSchema)(input, {
            onExcessProperty: 'error',
          });
        },
        catch: nodeRpcErrorFor(['node-tab-detached']),
      }).pipe(
        Effect.flatMap(request =>
          subscribe({
            request,
            interests: this.#interests,
            sink,
            attachment: this.attachment,
            subscription: this.subscription,
            check: () => this.check(),
            assertCurrent: () => this.assertCurrent(),
            isClosed: () => this.closed,
          }),
        ),
      ),
    );
  }

  private async assertCurrent() {
    this.check();
    const snapshot = await this.attachment.node.snapshot();
    this.check();
    if (snapshot.metadata.nodeId !== this.attachment.boundNodeId) {
      throw makeZerospinError('standalone-capability-stale');
    }
    return snapshot;
  }

  async getPushPaused() {
    return BrowserRpc.run(
      Effect.tryPromise({
        try: async () => (await this.assertCurrent()).metadata.pushPaused,
        catch: controlFailure,
      }),
    );
  }

  async setPushPaused(input: unknown) {
    return BrowserRpc.run(
      Effect.try({
        try: () => {
          this.check();
          return Schema.decodeUnknownSync(BrowserSessionPushPausedSchema)(
            input,
            {
              onExcessProperty: 'error',
            },
          );
        },
        catch: controlFailure,
      }).pipe(
        Effect.flatMap(({ pushPaused }) =>
          Effect.tryPromise({
            try: async () => {
              await this.assertCurrent();
              await this.attachment.node.setPushPaused(
                pushPaused,
                this.attachment.boundNodeId,
              );
              if (!pushPaused) {
                void BrowserRpc.run(this.drain()).catch(() => undefined);
              }
            },
            catch: controlFailure,
          }),
        ),
      ),
    );
  }

  async pushNow() {
    return BrowserRpc.run(
      Effect.tryPromise({
        try: () => this.assertCurrent(),
        catch: controlFailure,
      }).pipe(Effect.flatMap(() => this.push(this.attachment.boundNodeId))),
    );
  }

  async dispose() {
    return BrowserRpc.run(dispose({ dispose: () => this[Symbol.dispose]() }));
  }

  [Symbol.dispose]() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.subscription.dispose();
    } finally {
      this.releaseSession();
    }
  }
}

export type IStandaloneBrowserSessionApi = Pick<
  StandaloneBrowserSessionApi,
  | 'getStagedCommandSubscriber'
  | 'subscribe'
  | 'getPushPaused'
  | 'setPushPaused'
  | 'pushNow'
  | 'dispose'
>;

export type IStandaloneViewRequest = typeof SubscriptionSchema.Type;
