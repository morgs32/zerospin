import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

/**
 * Every production RpcTarget lives in a same-named folder and keeps domain
 * methods in same-named folders. Repos delegate to their domain Effects. The
 * generated API family uses makeRpcApi and rpcMethod definitions instead of
 * handwritten forwarding; see schema-backed-capabilities.ts.
 *
 * PartitionApi/PartitionApi.ts
 * PartitionApi/acquireSessionDatabase/acquireSessionDatabase.ts
 *
 * Exception: IFanoutRepo owners inline `makeFanoutQueue` on the class (`#field`
 * + prototype getter). IFanoutSubscriberRepo owners inline `makeFanoutSubscriber`
 * inside `${queueName}Subscriber(sourceKey)` prototype methods, binding one
 * source queue and its durable receiver cursor on each call. Do not add
 * `FanoutQueue/getPage/`, `FanoutQueue/subscribe/`, `FanoutSubscriber/receive/`,
 * `FanoutSubscriber/catchup/`, `FanoutSubscriber/subscribe/`, or `<queueName>/`
 * method folders. Factory queue `getPage` / `subscribe` and subscriber
 * `receive` / `catchup` / `subscribe` methods remain inline.
 * The same exception applies to IOutboxQueue / IOutboxSubscriber owners:
 * inline makeOutboxQueue / makeOutboxSubscriber behind queue and subscriber
 * getters. Outboxes bind one receiver, expose no enqueue or subscription RPC,
 * and keep drain / hasPending as local Effects.
 * Transport-only test fixtures may remain inline. Non-public one-consumer
 * helpers stay inline unless reused, independently tested, or part of an
 * explicitly approved shared utility.
 * See `system-worker/i-fanout-repo.ts`.
 *
 * @bad Keep a full RPC workflow inline in the RpcTarget class.
 * @bad Exempt an Api, gateway, provider, or failure target because it is not a Repo.
 * @bad Import `acquireSessionDatabase` under an alias when the class already supplies scope.
 * @bad Create an `index.ts` barrel just to re-export the method file.
 * @bad Create a method folder for an IFanoutRepo queue or its nested `subscribe`.
 * @bad Create a method folder for an IFanoutSubscriberRepo or its nested `receive`.
 */
export class PartitionApi extends RpcTarget {
  constructor(
    readonly runtime: typeof execution,
    readonly db: unknown,
  ) {
    super();
  }

  async acquireSessionDatabase(props: { sessionName: string }) {
    return this.runtime.runPromise(
      acquireSessionDatabase({
        sessionName: props.sessionName,
        db: this.db,
      }).pipe(settleResult),
    );
  }
}

export const acquireSessionDatabase = Effect.fn(
  'PartitionApi.acquireSessionDatabase',
)(function* (props: { sessionName: string; db: unknown }) {
  return yield* acquireDatabase(props);
});

declare const execution: {
  runPromise(effect: unknown): Promise<unknown>;
};
declare function settleResult(effect: unknown): unknown;
declare function acquireDatabase(props: {
  sessionName: string;
  db: unknown;
}): Effect.Effect<void>;
