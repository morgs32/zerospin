import type { Effect, Fiber, Schema, Stream } from 'effect';

import type { StateInactive } from './StateInactive.js';

type IExact<EXPECTED, ACTUAL> = EXPECTED extends unknown
  ? ACTUAL extends EXPECTED
    ? EXPECTED extends object
      ? ACTUAL extends object
        ? ACTUAL & Record<Exclude<keyof ACTUAL, keyof EXPECTED>, never>
        : never
      : ACTUAL
    : never
  : never;

type IMerge<LEFT, RIGHT> = {
  readonly [KEY in keyof LEFT | keyof RIGHT]: KEY extends keyof RIGHT
    ? RIGHT[KEY]
    : KEY extends keyof LEFT
      ? LEFT[KEY]
      : never;
};

export type { State } from './makeState/State.js';

export type IAnyState = {
  readonly stateName: string;
  readonly input: Schema.Struct.Fields;
  readonly schema: Schema.Constraint;
  readonly make: (fields: never) => unknown;
};

export type IStateMap = Readonly<Record<string, IAnyState>>;

export type IInferStateValue<STATE> = STATE extends {
  readonly stateName: infer NAME extends string;
  readonly input: infer FIELDS extends Schema.Struct.Fields;
}
  ? IMerge<{ readonly stateName: NAME }, Schema.Struct.Type<FIELDS>>
  : never;

export type IInferStateName<STATE> = STATE extends {
  readonly stateName: infer NAME extends string;
}
  ? NAME
  : IInferStateValue<STATE> extends {
        readonly stateName: infer NAME extends string;
      }
    ? NAME
    : never;

export type IMachine<
  STATES extends IStateMap = IStateMap,
  INITIAL extends IInferStateValue<STATES[keyof STATES]> = IInferStateValue<
    STATES[keyof STATES]
  >,
  ROUTES = Readonly<Record<string, unknown>>,
> = {
  readonly states: STATES;
  readonly initial: INITIAL;
  readonly routes: ROUTES;
};

export type IAnyMachine = IMachine<
  IStateMap,
  IInferStateValue<IAnyState>,
  unknown
>;

export type IInferRegisteredState<MACHINE> = MACHINE extends IAnyMachine
  ? MACHINE['states'][keyof MACHINE['states']]
  : never;

export type IInferMachineValue<MACHINE> = IInferStateValue<
  IInferRegisteredState<MACHINE>
>;

type IInferProgramServices<PROGRAM> = PROGRAM extends (
  ...args: never[]
) => infer RESULT
  ? Effect.Services<RESULT>
  : never;

type IInferStateRouteServices<STATE_ROUTES> =
  | (STATE_ROUTES extends {
      readonly onActivation: infer PROGRAM;
    }
      ? IInferProgramServices<PROGRAM>
      : never)
  | (STATE_ROUTES extends {
      readonly actions: infer ACTIONS;
    }
      ? {
          [ACTION in keyof ACTIONS]: ACTIONS[ACTION] extends {
            readonly program: infer PROGRAM;
          }
            ? IInferProgramServices<PROGRAM>
            : never;
        }[keyof ACTIONS]
      : never);

export type IInferMachineRouteServices<MACHINE> = MACHINE extends {
  readonly routes: infer ROUTES;
}
  ? {
      [STATE in keyof ROUTES]: IInferStateRouteServices<ROUTES[STATE]>;
    }[keyof ROUTES]
  : never;

type IInferMachineRoutes<MACHINE> = MACHINE extends IAnyMachine
  ? MACHINE['routes']
  : never;

type IInferMachineStateByName<
  MACHINE,
  NAME extends string,
> = MACHINE extends IAnyMachine
  ? NAME extends keyof MACHINE['states']
    ? MACHINE['states'][NAME]
    : never
  : never;

type IInferStateRoutes<MACHINE, STATE extends IAnyState> =
  IInferStateName<STATE> extends keyof IInferMachineRoutes<MACHINE>
    ? IInferMachineRoutes<MACHINE>[IInferStateName<STATE>]
    : never;

type IInferStateActions<MACHINE, STATE extends IAnyState> =
  IInferStateRoutes<MACHINE, STATE> extends {
    readonly actions: infer ACTIONS;
  }
    ? ACTIONS
    : Readonly<Record<never, never>>;

type IInferActionPayloadSchema<ACTION> = ACTION extends {
  readonly payload: infer PAYLOAD extends Schema.Top;
}
  ? PAYLOAD
  : never;

type IInferActionPayload<ACTION> = Schema.Schema.Type<
  IInferActionPayloadSchema<ACTION>
>;

type IInferActionProgram<ACTION> = ACTION extends {
  readonly program: infer PROGRAM;
}
  ? PROGRAM
  : never;

type IInferProgramSuccess<PROGRAM> = PROGRAM extends (
  ...args: never[]
) => infer RESULT
  ? Effect.Success<RESULT>
  : never;

type IInferProgramFailure<PROGRAM> = PROGRAM extends (
  ...args: never[]
) => infer RESULT
  ? Effect.Error<RESULT>
  : never;

type IInferProgramDestinationHandle<MACHINE, PROGRAM> =
  IInferProgramSuccess<PROGRAM> extends infer VALUE
    ? VALUE extends { readonly stateName: infer NAME extends string }
      ? IInferMachineStateByName<MACHINE, NAME> extends infer STATE
        ? STATE extends IAnyState
          ? IInferStateHandle<MACHINE, STATE>
          : never
        : never
      : never
    : never;

type IIsVoidAction<ACTION> = [IInferActionPayloadSchema<ACTION>] extends [
  typeof Schema.Void,
]
  ? [typeof Schema.Void] extends [IInferActionPayloadSchema<ACTION>]
    ? true
    : false
  : false;

type IStateHandleAction<MACHINE, ACTION> =
  IInferActionProgram<ACTION> extends infer PROGRAM
    ? PROGRAM extends (
        ...args: never[]
      ) => Effect.Effect<unknown, unknown, unknown>
      ? IIsVoidAction<ACTION> extends true
        ? () => Effect.Effect<
            IInferProgramDestinationHandle<MACHINE, PROGRAM>,
            IInferProgramFailure<PROGRAM> | StateInactive
          >
        : <const PAYLOAD extends IInferActionPayload<ACTION>>(
            payload: IExact<IInferActionPayload<ACTION>, PAYLOAD>,
          ) => Effect.Effect<
            IInferProgramDestinationHandle<MACHINE, PROGRAM>,
            IInferProgramFailure<PROGRAM> | StateInactive
          >
      : never
    : never;

type IStateHandleActions<MACHINE, ACTIONS> = ACTIONS extends object
  ? {
      readonly [ACTION in keyof ACTIONS]: IStateHandleAction<
        MACHINE,
        ACTIONS[ACTION]
      >;
    }
  : Readonly<Record<never, never>>;

export type IStateHandle<
  MACHINE = IAnyMachine,
  STATE extends IAnyState = IAnyState,
> = IInferStateValue<STATE> & {
  readonly actions: IStateHandleActions<
    MACHINE,
    IInferStateActions<MACHINE, STATE>
  >;
};

export type IInferStateHandle<MACHINE, STATE extends IAnyState> = IStateHandle<
  MACHINE,
  STATE
>;

export type IInferMachineStateHandle<MACHINE> =
  IInferRegisteredState<MACHINE> extends infer STATE
    ? STATE extends IAnyState
      ? IInferStateHandle<MACHINE, STATE>
      : never
    : never;

export interface IMachineActor<MACHINE extends IAnyMachine, RUNTIME_ERROR> {
  readonly getHandle: () => Effect.Effect<IInferMachineStateHandle<MACHINE>>;
  readonly handleStream: Stream.Stream<IInferMachineStateHandle<MACHINE>>;
  readonly start: () => Fiber.Fiber<never, RUNTIME_ERROR>;
  readonly ready: () => Effect.Effect<void, RUNTIME_ERROR>;
}

export type IRouteContractChannel = 'success' | 'failure';

export type IRouteContractIssue =
  | 'MissingStateName'
  | 'UnregisteredState'
  | 'SchemaFailure';

export type IRouteContractExpected = readonly string[] | Schema.Top;
