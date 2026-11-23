import * as Effect from 'effect/Effect';
import * as SubscriptionRef from 'effect/SubscriptionRef';

export const makeHandleStore = <HANDLE>(props: {
  readonly initialHandle: HANDLE;
}) => {
  const { initialHandle } = props;

  // SubscriptionRef.make is a known-synchronous allocation. Keeping this
  // narrow runSync preserves its replay protocol for synchronous Actors.
  const handleRef = Effect.runSync(SubscriptionRef.make(initialHandle));

  const getHandle = (): Effect.Effect<HANDLE> => SubscriptionRef.get(handleRef);
  const publish = (handle: HANDLE): Effect.Effect<void> =>
    SubscriptionRef.set(handleRef, handle);

  return {
    getHandle,
    handleStream: SubscriptionRef.changes(handleRef),
    publish,
  };
};
