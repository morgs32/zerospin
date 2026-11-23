import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IStateMap } from '../types.js';

import { validateProgramSuccess } from './validateProgramSuccess.js';

type IStateValue = { readonly stateName: string };

/** Invoke one Action program and enforce its payload and result contracts. */
export const invokeActionProgram = Effect.fn('invokeActionProgram')(function* <
  SUCCESS,
  FAILURE,
  SERVICES,
>(props: {
  readonly states: IStateMap;
  readonly path: string;
  readonly action: {
    readonly payload: Schema.Top;
    readonly program: (request: {
      readonly origin: IStateValue;
      readonly payload: unknown;
    }) => Effect.Effect<SUCCESS, FAILURE, SERVICES>;
  };
  readonly origin: IStateValue;
  readonly payload: unknown;
}) {
  const { action, origin, path, payload, states } = props;

  if (!Schema.is(action.payload)(payload)) {
    return yield* Effect.die(
      new TypeError(
        `MachineActor payload does not satisfy Action Route "${path}"`,
      ),
    );
  }

  const result = yield* Effect.suspend(() =>
    action.program({ origin, payload }),
  );

  return validateProgramSuccess({ states, path, origin, result });
});
