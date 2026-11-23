import { makeNodeSnapshotRequestSchema } from '@zerospin/core/Node/NodeSnapshotRequestSchema';
import type {
  IServiceNodeState,
  ServiceNode,
} from '@zerospin/core/ServiceNode/ServiceNode';
import { ServiceNodeCommandSchema } from '@zerospin/core/ServiceNode/ServiceNodeCommandSchema';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';
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

import { clearAuthentication } from './clearAuthentication/clearAuthentication.ts';
import { dispose } from './dispose/dispose.ts';
import { pushNow } from './pushNow/pushNow.ts';
import { receiveCommandRows } from './receiveCommandRows.ts';
import { resume } from './resume/resume.ts';
import type { ServiceNodeSynchronization } from './ServiceNodeSynchronization.ts';
import { setPushPaused } from './setPushPaused/setPushPaused.ts';
import { snapshot } from './snapshot/snapshot.ts';
import { subscribe } from './subscribe/subscribe.ts';
const SubscriptionSchema = makeNodeSnapshotRequestSchema(
  ServiceNodeCommandSchema,
);

export class ServiceBrowserSessionApi extends RpcTarget {
  #node: ServiceNode;
  #synchronization: Pick<
    ServiceNodeSynchronization,
    'push' | 'resume' | 'pushProgram' | 'resumeProgram'
  >;
  #clear: () => Promise<void>;
  #deliveryGeneration = 0;
  #notifySignOut: ((state: IServiceNodeState) => Promise<void>) | undefined;
  readonly #interests = makeNodeCommandInterests<IServiceNodeCommand>();
  readonly #subscription = makeBrowserSessionSubscription();
  readonly #attachment: ReturnType<typeof makeNodeAttachment>;

  constructor(
    node: ServiceNode,
    synchronization: Pick<
      ServiceNodeSynchronization,
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
    attachment.own(() => {
      this.#notifySignOut = undefined;
      this.#subscription.dispose();
    });
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
      schema: ServiceNodeCommandSchema,
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
    sink: RpcStub<Required<Parameters<ServiceNode['subscribe']>[1]>>,
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
              this.#notifySignOut = notify;
            },
          }),
        ),
      ),
    );
  }

  /** Acknowledge identity revocation through the existing sink before retiring its capability. */
  async notifySignedOut() {
    const notify = this.#notifySignOut;
    if (notify === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
          timer = setTimeout(resolve, 1000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
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

  [Symbol.dispose]() {
    this.#attachment.dispose();
  }
}
export type IServiceBrowserSessionApi = Pick<
  ServiceBrowserSessionApi,
  | 'snapshot'
  | 'getStagedCommandSubscriber'
  | 'subscribe'
  | 'pushNow'
  | 'resume'
  | 'clearAuthentication'
  | 'setPushPaused'
  | 'dispose'
>;

export type IServiceViewRequest = typeof SubscriptionSchema.Type;
