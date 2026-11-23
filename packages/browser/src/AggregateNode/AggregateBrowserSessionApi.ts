import type {
  AggregateNode,
  IAggregateNodeState,
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
import type { makeNodeAttachment } from '../Node/makeNodeAttachment.ts';
import { makeNodeCommandInterests } from '../Node/makeNodeCommandInterests.ts';
import { nodeRpcErrorFor } from '../Node/nodeRpcErrorFor.ts';
import { makeOutboxSubscriber } from '../outbox/makeOutboxSubscriber.ts';

import type { AggregateNodeSynchronization } from './AggregateNodeSynchronization.ts';
import { clearAuthentication } from './clearAuthentication/clearAuthentication.ts';
import { dispose } from './dispose/dispose.ts';
import { pushNow } from './pushNow/pushNow.ts';
import { receiveCommandRows } from './receiveCommandRows.ts';
import { resume } from './resume/resume.ts';
import { setPushPaused } from './setPushPaused/setPushPaused.ts';
import { snapshot } from './snapshot/snapshot.ts';
import { subscribe } from './subscribe/subscribe.ts';
const SubscriptionSchema = makeNodeSnapshotRequestSchema(
  AggregateNodeCommandSchema,
);

export class AggregateBrowserSessionApi extends RpcTarget {
  #node: AggregateNode;
  #synchronization: Pick<
    AggregateNodeSynchronization,
    'push' | 'resume' | 'pushProgram' | 'resumeProgram'
  >;
  #clear: () => Promise<void>;
  #deliveryGeneration = 0;
  #signOutNotification:
    | ((state: IAggregateNodeState) => Promise<void>)
    | undefined;
  readonly #interests = makeNodeCommandInterests<IAggregateNodeCommand>();
  readonly #subscription = makeBrowserSessionSubscription();
  readonly #attachment: ReturnType<typeof makeNodeAttachment>;

  constructor(
    node: AggregateNode,
    synchronization: Pick<
      AggregateNodeSynchronization,
      'push' | 'resume' | 'pushProgram' | 'resumeProgram'
    >,
    clear: () => Promise<void>,
    attachment: ReturnType<typeof makeNodeAttachment>,
  ) {
    super();
    this.#node = node;
    this.#synchronization = synchronization;
    this.#clear = clear;
    this.#attachment = attachment;
    attachment.own(() => this.#subscription.dispose());
  }

  #check() {
    this.#attachment.check();
  }

  async snapshot(input: unknown = {}) {
    return BrowserRpc.run(
      snapshot({ input, node: this.#node, check: () => this.#check() }),
    );
  }

  getStagedCommandSubscriber(input: unknown) {
    this.#check();
    const expectedNodeId = Schema.decodeUnknownSync(Schema.NonEmptyString)(
      input,
    );
    const generation = this.#deliveryGeneration;
    const check = () => {
      this.#check();
      if (generation !== this.#deliveryGeneration) {
        throw makeZerospinError('outbox-source-replaced');
      }
    };
    return makeOutboxSubscriber({
      schema: AggregateNodeCommandSchema,
      check,
      receive: async rows => {
        this.#interests.add(rows);
        const receipts = await receiveCommandRows({
          rows,
          expectedNodeId,
          node: this.#node,
          check,
          synchronization: this.#synchronization,
        });
        this.#interests.retained(receipts);
        return receipts;
      },
    });
  }

  async subscribe(
    input: unknown,
    sink: RpcStub<Required<Parameters<AggregateNode['subscribe']>[1]>>,
  ) {
    return BrowserRpc.run(
      Effect.try({
        try: () => {
          this.#check();
          return Schema.decodeUnknownSync(SubscriptionSchema)(input, {
            onExcessProperty: 'error',
          });
        },
        catch: nodeRpcErrorFor(['node-signed-out', 'node-tab-detached']),
      }).pipe(
        Effect.flatMap(request =>
          subscribe({
            request,
            interests: this.#interests,
            sink,
            node: this.#node,
            subscription: this.#subscription,
            check: () => this.#check(),
            isCurrent: this.#attachment.isCurrent,
            isDetached: this.#attachment.isDetached,
            onReset: () => {
              this.#deliveryGeneration += 1;
            },
            registerSignOutNotification: notify => {
              this.#signOutNotification = notify;
            },
          }),
        ),
      ),
    );
  }

  async pushNow() {
    return BrowserRpc.run(
      pushNow({
        synchronization: this.#synchronization,
        check: () => this.#check(),
      }),
    );
  }

  async resume() {
    return BrowserRpc.run(
      resume({
        synchronization: this.#synchronization,
        check: () => this.#check(),
      }),
    );
  }

  async clearAuthentication() {
    return BrowserRpc.run(
      clearAuthentication({
        check: () => this.#check(),
        clear: () => this.#clear(),
      }),
    );
  }

  async setPushPaused(input: unknown) {
    return BrowserRpc.run(
      Effect.try({
        try: () => {
          this.#check();
          return Schema.decodeUnknownSync(BrowserSessionPushPausedSchema)(
            input,
            {
              onExcessProperty: 'error',
            },
          );
        },
        catch: nodeRpcErrorFor(['node-signed-out', 'node-tab-detached']),
      }).pipe(
        Effect.flatMap(({ pushPaused }) =>
          setPushPaused({
            pushPaused,
            node: this.#node,
            synchronization: this.#synchronization,
            check: () => this.#check(),
          }),
        ),
      ),
    );
  }

  async dispose() {
    return BrowserRpc.run(dispose({ dispose: () => this[Symbol.dispose]() }));
  }

  ownAttachment(release: () => void) {
    this.#attachment.own(release);
  }

  async notifySignedOut() {
    const notify = this.#signOutNotification;
    if (notify === undefined) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          const snapshot = await this.#node.snapshot({ authoritative: true });
          await notify({
            ...snapshot.state,
            nodeId: snapshot.metadata.nodeId,
            nodeIndex: snapshot.nodeIndex,
            pushIndex: snapshot.pushIndex,
            admittedThroughPushIndex:
              snapshot.metadata.admittedThroughPushIndex,
            outcomeIndex: snapshot.outcomeIndex,
            pushPaused: snapshot.metadata.pushPaused,
          });
        })(),
        new Promise<void>(resolve => {
          timeout = setTimeout(resolve, 1000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  [Symbol.dispose]() {
    this.#attachment.dispose();
  }
}
export type IAggregateBrowserSessionApi = Pick<
  AggregateBrowserSessionApi,
  | 'snapshot'
  | 'getStagedCommandSubscriber'
  | 'subscribe'
  | 'pushNow'
  | 'resume'
  | 'clearAuthentication'
  | 'setPushPaused'
  | 'dispose'
>;

export type IAggregateViewRequest = typeof SubscriptionSchema.Type;
