import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { decodeStateMap } from '../makeState/decodeStateMap.js';
import { rethrowSchemaError } from '../rethrowSchemaError.js';
import type { IStateMap } from '../types.js';

import { CanonicalRouteSchema } from './Route.js';

const StrictParseOptions = { onExcessProperty: 'error' } as const;

type ICallable = (...args: never[]) => unknown;
type IStateValue = { readonly stateName: string };

interface IRuntimeActionRoute {
  readonly payload: Schema.Top;
  readonly program: ICallable;
}

interface IRuntimeStateRoutes {
  readonly onActivation?: ICallable;
  readonly actions?: Readonly<Record<string, IRuntimeActionRoute>>;
}

type IRuntimeMachineRoutes = Readonly<Record<string, IRuntimeStateRoutes>>;

interface IMachineData {
  readonly states: IStateMap;
  readonly initial: IStateValue;
  readonly routes: IRuntimeMachineRoutes;
}

const CallableSchema = Schema.declare<ICallable>(
  (value): value is ICallable => typeof value === 'function',
);

const EffectSchema = Schema.declare<Schema.Top>((value): value is Schema.Top =>
  Schema.isSchema(value),
);

const StringPropertyKeys = Schema.makeFilter<object>(value =>
  Reflect.ownKeys(value).every(key => typeof key === 'string')
    ? undefined
    : 'Expected only string keys',
);

const ActionRouteSchema = Schema.Struct({
  payload: EffectSchema,
  program: CallableSchema,
});

const ActionsSchema = Schema.Record(
  Schema.PropertyKey,
  ActionRouteSchema,
).check(Schema.isMinProperties(1), StringPropertyKeys);

const StateRoutesSchema = Schema.Struct({
  onActivation: Schema.optionalKey(CallableSchema),
  actions: Schema.optionalKey(ActionsSchema),
}).check(Schema.isMinProperties(1));

const MachinePropsShapeSchema = Schema.Struct({
  states: Schema.Unknown,
  initial: Schema.Unknown,
  routes: Schema.Unknown,
});

const decodeInitial = (states: IStateMap, input: unknown): IStateValue => {
  const named = Schema.decodeUnknownSync(
    Schema.Struct({ stateName: Schema.Literals(Object.keys(states)) }),
  )(input);
  const state = states[named.stateName];
  if (state === undefined) {
    return Schema.decodeUnknownSync(Schema.Never)(input);
  }

  try {
    Schema.decodeUnknownSync(
      Schema.toType(state.schema),
      StrictParseOptions,
    )(input);
  } catch (error) {
    rethrowSchemaError(error);
  }

  // ALLOWED_CAST: the registered State value schema accepted the supplied
  // value. Keep the exact canonical value rather than the decoded snapshot.
  return input as IStateValue;
};

const makeAuthoredRoutesSchema = (states: IStateMap) =>
  Schema.Struct(
    mapValues(states, () => Schema.optionalKey(StateRoutesSchema)),
  ).check(Schema.isMinProperties(1));

const makeCanonicalRoutesSchema = (states: IStateMap) =>
  Schema.Struct(
    mapValues(states, () => Schema.optionalKey(CanonicalRouteSchema)),
  ).check(Schema.isMinProperties(1));

const decodeRoutes = (
  states: IStateMap,
  input: unknown,
  canonical: boolean,
): IRuntimeMachineRoutes => {
  if (canonical) {
    const routes = Schema.decodeUnknownSync(
      makeCanonicalRoutesSchema(states),
      StrictParseOptions,
    )(input);
    for (const route of Object.values(routes)) {
      if (route === undefined) {
        continue;
      }
      Schema.decodeUnknownSync(StateRoutesSchema, StrictParseOptions)(route);
    }
    // ALLOWED_CAST: every generated State key is optional in the sparse Route
    // schema, while decoded output contains only the placements actually
    // supplied on the canonical Machine.
    return routes as unknown as IRuntimeMachineRoutes;
  }

  const decodedRoutes = Schema.decodeUnknownSync(
    makeAuthoredRoutesSchema(states),
    StrictParseOptions,
  )(input);
  // ALLOWED_CAST: every generated State key is optional in the sparse Route
  // schema, while decoded output contains only the placements actually
  // supplied by the author.
  return decodedRoutes as unknown as IRuntimeMachineRoutes;
};

export const decodeMachineData = (
  input: unknown,
  canonical: boolean,
): IMachineData => {
  const decodedProps = Schema.decodeUnknownSync(
    MachinePropsShapeSchema,
    StrictParseOptions,
  )(input);
  const states = decodeStateMap(decodedProps.states);
  const initial = decodeInitial(states, decodedProps.initial);
  const routes = decodeRoutes(states, decodedProps.routes, canonical);

  return { states, initial, routes };
};
