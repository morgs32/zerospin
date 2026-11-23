import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';
import * as Scope from 'effect/Scope';
import * as Semaphore from 'effect/Semaphore';

import type { IAnyState, IStateMap } from '../types.js';

import type {
  IActionExecutor,
  IActivation,
  IActivationRouteFiber,
  IActorLifecycle,
  IActorStatus,
  IRuntimeMachineRoutes,
  IRuntimeSave,
  IRuntimeStateHandle,
  IStateValue,
} from './actorLifecycle.js';
import { closeActor } from './closeActor.js';
import { executeActorAction } from './executeActorAction.js';
import type { makeHandleStore } from './makeHandleStore.js';
import { startActivationRoute } from './startActivationRoute.js';

export const runActorOwner = Effect.fnUntraced(function* (props: {
  states: IStateMap;
  routes: IRuntimeMachineRoutes;
  initialState: IAnyState;
  initial: IStateValue;
  initialActivationId: symbol;
  initialHandle: IRuntimeStateHandle;
  runtimeSave: IRuntimeSave | undefined;
  handleStore: ReturnType<typeof makeHandleStore<IRuntimeStateHandle>>;
  makeStateHandle: (
    state: IAnyState,
    value: IStateValue,
    id: symbol,
  ) => IRuntimeStateHandle;
  bindExecutor: (execute: IActionExecutor) => void;
  onReady: () => void;
}) {
  const createStateHandle = props.makeStateHandle.bind(props);
  const bindActorExecutor = props.bindExecutor.bind(props);
  const {
    states,
    routes,
    initialState,
    initial,
    initialActivationId,
    initialHandle,
    runtimeSave,
    handleStore,
    onReady,
  } = props;
  const routeContext = yield* Effect.context<unknown>();
  const actorScope = Scope.makeUnsafe('sequential');
  const makeActivation = (
    state: IAnyState,
    value: IStateValue,
    prepared?: { id: symbol; handle: IRuntimeStateHandle },
  ): IActivation => {
    const id = prepared?.id ?? Symbol(state.stateName);
    return {
      id,
      state,
      value,
      handle: prepared?.handle ?? createStateHandle(state, value, id),
      scope: Scope.forkUnsafe(actorScope, 'sequential'),
      routeFiber: Ref.makeUnsafe<IActivationRouteFiber | undefined>(undefined),
    };
  };
  const initialActivation = makeActivation(initialState, initial, {
    id: initialActivationId,
    handle: initialHandle,
  });
  const owner: IActorLifecycle = {
    states,
    routes,
    runtimeSave,
    handleStore,
    routeContext,
    actorScope,
    makeActivation,
    gate: Semaphore.makeUnsafe(1),
    status: Ref.makeUnsafe<IActorStatus>({ _tag: 'Starting' }),
    termination: Deferred.makeUnsafe<never, never>(),
    active: Ref.makeUnsafe(initialActivation),
    activeAction:
      Ref.makeUnsafe<
        IActorLifecycle['activeAction'] extends Ref.Ref<infer A> ? A : never
      >(undefined),
  };
  yield* Effect.uninterruptible(Effect.addFinalizer(() => closeActor(owner)));
  bindActorExecutor(request => executeActorAction(owner, request));
  yield* Ref.set(owner.status, { _tag: 'Running' });
  yield* startActivationRoute(owner, initialActivation);
  // Readiness is ordered against an immediately completing initial activation.
  yield* owner.gate.withPermit(
    Effect.gen(function* () {
      const status = yield* Ref.get(owner.status);
      switch (status._tag) {
        case 'Running':
          yield* Effect.sync(onReady);
          return;
        case 'DefectTerminated':
          return yield* Effect.failCause(status.cause);
        case 'Starting':
        case 'Closing':
        case 'Closed':
          return yield* Effect.die(new TypeError('MachineActor is not ready'));
      }
    }),
  );
  return yield* Deferred.await(owner.termination);
}, Effect.scoped);
