import type { Effect, Schema } from 'effect';

import type {
  IInferStateName,
  IInferStateValue,
  IMachine,
  IStateMap,
} from '../types.js';

import { makeMachineValue } from './makeMachineValue.js';

type ITypeError<MESSAGE extends string> = {
  readonly __typeError: MESSAGE;
};

type IRegisteredValue<STATES extends IStateMap> = IInferStateValue<
  STATES[keyof STATES]
>;

type IAtLeastOneKey<VALUE> = {
  readonly [KEY in keyof VALUE]: {
    readonly [CURRENT in KEY]: unknown;
  };
}[keyof VALUE];

type IExactActionRoute<ACTION> = ACTION extends object
  ? Record<Exclude<keyof ACTION, 'payload' | 'program'>, never>
  : ITypeError<'Action Route must be an object'>;

type IExactActions<ACTIONS> = ACTIONS extends object
  ? keyof ACTIONS extends never
    ? ITypeError<'actions must contain at least one Action Route'>
    : {
        readonly [ACTION in keyof ACTIONS]: IExactActionRoute<ACTIONS[ACTION]>;
      }
  : ITypeError<'actions must be an object'>;

type IExactStateRoutes<STATE_ROUTES> = STATE_ROUTES extends object
  ? Record<Exclude<keyof STATE_ROUTES, 'onActivation' | 'actions'>, never> &
      ('actions' extends keyof STATE_ROUTES
        ? {
            readonly actions: IExactActions<STATE_ROUTES['actions']>;
          }
        : unknown)
  : ITypeError<'State routes must be an object'>;

type IExactMachineRoutes<ROUTES> = {
  readonly [STATE in keyof ROUTES]: IExactStateRoutes<ROUTES[STATE]>;
};

type IMachineRoutesContext<STATES extends IStateMap, PAYLOADS> = {
  readonly [STATE in keyof PAYLOADS]: {
    readonly onActivation?: (request: {
      readonly origin: IInferStateValue<STATES[STATE & keyof STATES]>;
    }) => Effect.Effect<IRegisteredValue<STATES>, never, unknown>;
    readonly actions?: {
      readonly [ACTION in keyof PAYLOADS[STATE]]: {
        readonly payload: PAYLOADS[STATE][ACTION] & Schema.Top;
        readonly program: (request: {
          readonly origin: IInferStateValue<STATES[STATE & keyof STATES]>;
          readonly payload: Schema.Schema.Type<
            PAYLOADS[STATE][ACTION] & Schema.Top
          >;
        }) => Effect.Effect<IRegisteredValue<STATES>, unknown, unknown>;
      };
    };
  } & ({ readonly onActivation: unknown } | { readonly actions: unknown }) &
    (STATE extends keyof STATES
      ? unknown
      : ITypeError<'Route State must be registered by the Machine'>);
};

type IAssertStateMapKeys<STATES extends IStateMap> = Record<
  Exclude<keyof STATES, string>,
  never
> & {
  readonly [KEY in keyof STATES & string]: KEY extends IInferStateName<
    STATES[KEY]
  >
    ? unknown
    : ITypeError<`State map key "${KEY}" must equal State name "${IInferStateName<STATES[KEY]>}"`>;
};

type INonEmptyStateMap<STATES extends IStateMap> = keyof STATES extends never
  ? ITypeError<'State map must contain at least one State'>
  : unknown;

export function makeMachine<
  const STATES extends IStateMap,
  const INITIAL extends IInferStateValue<
    NoInfer<STATES>[keyof NoInfer<STATES>]
  >,
  const PAYLOADS,
  const ROUTES,
>(props: {
  readonly states: STATES &
    IAssertStateMapKeys<STATES> &
    INonEmptyStateMap<STATES>;
  readonly initial: INITIAL;
  readonly routes: IMachineRoutesContext<NoInfer<STATES>, PAYLOADS> &
    ROUTES &
    IAtLeastOneKey<NoInfer<STATES>> &
    IExactMachineRoutes<NoInfer<ROUTES>>;
}): IMachine<STATES, INITIAL, ROUTES> {
  const machine = makeMachineValue(props);

  // ALLOWED_CAST: makeMachineValue strictly decoded the complete definition
  // into the private canonical Machine class while this signature preserves
  // contextual Route inference.
  return machine as IMachine<STATES, INITIAL, ROUTES>;
}
