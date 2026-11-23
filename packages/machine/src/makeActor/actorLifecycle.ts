import type {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Ref,
  Schema,
  Scope,
  Semaphore,
} from 'effect';

import type { IAnyState, IStateMap } from '../types.js';

import type { makeHandleStore } from './makeHandleStore.js';

export type IStateValue = { readonly stateName: string };

export type IRuntimeSave = (transition: {
  readonly origin: IStateValue;
  readonly destination: IStateValue;
}) => Effect.Effect<void, never, unknown>;

export type IRuntimeActivationProgram = (request: {
  readonly origin: IStateValue;
}) => Effect.Effect<unknown, unknown, unknown>;

export type IRuntimeActionProgram = (request: {
  readonly origin: IStateValue;
  readonly payload: unknown;
}) => Effect.Effect<unknown, unknown, unknown>;

export interface IRuntimeActionRoute {
  readonly payload: Schema.Top;
  readonly program: IRuntimeActionProgram;
}

export interface IRuntimeStateRoutes {
  readonly onActivation?: IRuntimeActivationProgram;
  readonly actions?: Readonly<Record<string, IRuntimeActionRoute>>;
}

export type IRuntimeMachineRoutes = Readonly<
  Record<string, IRuntimeStateRoutes>
>;

export interface IRuntimeStateHandle extends IStateValue {
  readonly actions: Readonly<
    Record<
      string,
      (payload?: unknown) => Effect.Effect<IRuntimeStateHandle, unknown>
    >
  >;
}

export type IActorStatus =
  | { readonly _tag: 'Starting' }
  | { readonly _tag: 'Running' }
  | { readonly _tag: 'Closing' }
  | { readonly _tag: 'Closed' }
  | {
      readonly _tag: 'DefectTerminated';
      readonly cause: Cause.Cause<never>;
    };

export type ICleanupMode =
  | { readonly _tag: 'Close' }
  | { readonly _tag: 'Closed' }
  | {
      readonly _tag: 'Defect';
      readonly cause: Cause.Cause<never>;
    };

export type IActivationRouteExit = Exit.Exit<
  {
    readonly state: IAnyState;
    readonly value: IStateValue;
  },
  never
>;

export type IActivationRouteFiber = Fiber.Fiber<
  {
    readonly state: IAnyState;
    readonly value: IStateValue;
  },
  never
>;

export interface IActivation {
  readonly id: symbol;
  readonly state: IAnyState;
  readonly value: IStateValue;
  readonly handle: IRuntimeStateHandle;
  readonly scope: Scope.Closeable;
  readonly routeFiber: Ref.Ref<IActivationRouteFiber | undefined>;
}

export interface IActionRequest {
  readonly activationId: symbol;
  readonly state: IAnyState;
  readonly action: IRuntimeActionRoute;
  readonly path: string;
  readonly payload: unknown;
}

export type IActionExecutor = (
  request: IActionRequest,
) => Effect.Effect<IRuntimeStateHandle, unknown>;

export interface IActorLifecycle {
  readonly actorScope: Scope.Closeable;
  readonly routeContext: Context.Context<unknown>;
  readonly gate: Semaphore.Semaphore;
  readonly status: Ref.Ref<IActorStatus>;
  readonly termination: Deferred.Deferred<never, never>;
  readonly active: Ref.Ref<IActivation>;
  readonly activeAction: Ref.Ref<
    | Fiber.Fiber<
        { readonly state: IAnyState; readonly value: IStateValue },
        unknown
      >
    | undefined
  >;
  readonly states: IStateMap;
  readonly routes: IRuntimeMachineRoutes;
  readonly runtimeSave: IRuntimeSave | undefined;
  readonly handleStore: ReturnType<typeof makeHandleStore<IRuntimeStateHandle>>;
  readonly makeActivation: (
    state: IAnyState,
    value: IStateValue,
  ) => IActivation;
}
