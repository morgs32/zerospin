import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as Fiber from 'effect/Fiber';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import type * as Scope from 'effect/Scope';
import { mapValues } from 'es-toolkit';

import { validateMachine } from '../makeMachine/validateMachine.js';
import type {
  IAnyMachine,
  IAnyState,
  IInferMachineRouteServices,
  IInferMachineValue,
  IMachineActor,
  IStateMap,
} from '../types.js';

import type {
  IActionExecutor,
  IRuntimeMachineRoutes,
  IRuntimeSave,
  IRuntimeStateHandle,
} from './actorLifecycle.js';
import { makeHandleStore } from './makeHandleStore.js';
import { runActorOwner } from './runActorOwner.js';

type IStateValue = { readonly stateName: string };

type IActorSave<MACHINE extends IAnyMachine, SERVICES> = (transition: {
  readonly origin: IInferMachineValue<MACHINE>;
  readonly destination: IInferMachineValue<MACHINE>;
}) => Effect.Effect<void, never, SERVICES>;

type IActorSaveCandidate<MACHINE extends IAnyMachine> = (transition: {
  readonly origin: IInferMachineValue<MACHINE>;
  readonly destination: IInferMachineValue<MACHINE>;
}) => unknown;

type IActorSaveServices<SAVE> = SAVE extends (
  ...args: infer _ARGS
) => Effect.Effect<infer _SUCCESS, infer _FAILURE, infer SERVICES>
  ? SERVICES
  : never;

type ICheckedActorSave<
  MACHINE extends IAnyMachine,
  SAVE extends IActorSaveCandidate<MACHINE>,
> = SAVE &
  (SAVE extends (
    ...args: infer _ARGS
  ) => Effect.Effect<infer SUCCESS, infer FAILURE, infer _SERVICES>
    ? [FAILURE] extends [never]
      ? [SUCCESS] extends [void]
        ? unknown
        : IActorSave<MACHINE, never>
      : IActorSave<MACHINE, never>
    : IActorSave<MACHINE, never>);

interface IMakeActor {
  <
    const MACHINE extends IAnyMachine,
    const SAVE extends IActorSaveCandidate<NoInfer<MACHINE>>,
    const RUNTIME extends ManagedRuntime.ManagedRuntime<
      Exclude<
        | IInferMachineRouteServices<NoInfer<MACHINE>>
        | IActorSaveServices<NoInfer<SAVE>>,
        Scope.Scope
      >,
      unknown
    >,
  >(
    machine: MACHINE,
    props: {
      readonly runtime: RUNTIME;
      readonly save: ICheckedActorSave<NoInfer<MACHINE>, SAVE>;
    },
  ): IMachineActor<MACHINE, ManagedRuntime.ManagedRuntime.Error<RUNTIME>>;
  <
    const MACHINE extends IAnyMachine,
    const RUNTIME extends ManagedRuntime.ManagedRuntime<
      Exclude<IInferMachineRouteServices<NoInfer<MACHINE>>, Scope.Scope>,
      unknown
    >,
  >(
    machine: MACHINE,
    props: { readonly runtime: RUNTIME; readonly save?: undefined },
  ): IMachineActor<MACHINE, ManagedRuntime.ManagedRuntime.Error<RUNTIME>>;
}

export const makeActor: IMakeActor = <
  const MACHINE extends IAnyMachine,
  RUNTIME_ERROR,
>(
  machine: MACHINE,
  props: {
    readonly runtime: ManagedRuntime.ManagedRuntime<unknown, RUNTIME_ERROR>;
    readonly save?: IActorSave<NoInfer<MACHINE>, unknown> | undefined;
  },
) => {
  validateMachine(machine);
  const { runtime, save } = props;
  const states = machine.states as IStateMap;
  const initial = machine.initial as IStateValue;
  const initialState = Object.hasOwn(states, initial.stateName)
    ? states[initial.stateName]
    : undefined;
  if (initialState === undefined) {
    throw new TypeError(
      `MachineActor State is unavailable: ${initial.stateName}`,
    );
  }

  // ALLOWED_CAST: makeMachine validated every exact Route container,
  // payload Schema, and callable program before constructing this Machine.
  const routes = machine.routes as unknown as IRuntimeMachineRoutes;
  // ALLOWED_CAST: The Machine-derived Save input is erased only after
  // makeActor's public overload has checked its exact State-value union.
  const runtimeSave = save as IRuntimeSave | undefined;
  const readiness = Deferred.makeUnsafe<void, RUNTIME_ERROR>();

  let hasStarted = false;
  let isReady = false;
  let ownerExit: Exit.Exit<never, RUNTIME_ERROR> | undefined;
  let actionExecutor: IActionExecutor | undefined;

  const executeActionAtBoundary: IActionExecutor = request =>
    Effect.suspend(() => {
      if (!hasStarted) {
        return Effect.die(new TypeError('MachineActor has not been started'));
      }
      if (!isReady) {
        if (ownerExit !== undefined && Exit.isFailure(ownerExit)) {
          return Effect.failCause(ownerExit.cause);
        }
        return Effect.die(new TypeError('MachineActor is not ready'));
      }
      if (actionExecutor === undefined) {
        return Effect.die(new TypeError('MachineActor is not running'));
      }
      return actionExecutor(request);
    });

  const makeStateHandle = (
    state: IAnyState,
    value: IStateValue,
    activationId: symbol,
  ): IRuntimeStateHandle => {
    const stateName = state.stateName;
    const stateRoutes = Object.hasOwn(routes, stateName)
      ? routes[stateName]
      : undefined;
    const actionEntries: [
      string,
      (payload?: unknown) => Effect.Effect<IRuntimeStateHandle, unknown>,
    ][] = [];
    // mapValues owns record traversal; fromEntries preserves an authored __proto__ key.
    mapValues(stateRoutes?.actions ?? {}, (action, actionName) => {
      actionEntries.push([
        actionName,
        (payload?: unknown) =>
          executeActionAtBoundary({
            activationId,
            state,
            action,
            path: `${stateName}.actions.${actionName}`,
            payload,
          }),
      ]);
    });
    const actions = Object.fromEntries(actionEntries);
    return {
      ...value,
      actions,
    };
  };

  const initialActivationId = Symbol(initialState.stateName);
  const initialHandle = makeStateHandle(
    initialState,
    initial,
    initialActivationId,
  );
  const handleStore = makeHandleStore({ initialHandle });

  const owner = runActorOwner({
    states,
    routes,
    initialState,
    initial,
    initialActivationId,
    initialHandle,
    handleStore,
    runtimeSave,
    makeStateHandle,
    bindExecutor: executor => {
      actionExecutor = executor;
    },
    onReady: () => {
      isReady = true;
      Deferred.doneUnsafe(readiness, Effect.void);
    },
  });

  const start = (): Fiber.Fiber<never, RUNTIME_ERROR> => {
    if (hasStarted) {
      throw new TypeError('MachineActor has already been started');
    }
    hasStarted = true;

    try {
      const fiber = runtime.runFork(owner);
      fiber.addObserver(exit => {
        ownerExit = exit;
        if (!Deferred.isDoneUnsafe(readiness)) {
          Deferred.doneUnsafe(readiness, Exit.asVoid(exit));
        }
      });
      return fiber;
    } catch (error) {
      const exit = Exit.die(error);
      ownerExit = exit;
      Deferred.doneUnsafe(readiness, exit);
      throw error;
    }
  };

  const ready = (): Effect.Effect<void, RUNTIME_ERROR> =>
    Effect.suspend(() =>
      hasStarted
        ? Deferred.await(readiness)
        : Effect.die(new TypeError('MachineActor has not been started')),
    );

  // ALLOWED_CAST: the erased runtime machinery is narrowed back to the
  // Machine-derived Handle and ManagedRuntime Layer error at this boundary.
  return {
    getHandle: handleStore.getHandle,
    handleStream: handleStore.handleStream,
    start,
    ready,
  } as IMachineActor<MACHINE, RUNTIME_ERROR>;
};
