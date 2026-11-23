import * as Schema from 'effect/Schema';

type ICallable = (...args: ReadonlyArray<never>) => unknown;

interface IActionRoute {
  readonly payload: Schema.Top;
  readonly program: ICallable;
}

/** Provenance marker for Machine-decoded Route placements. */
export class Route {
  declare readonly onActivation?: ICallable;
  declare readonly actions?: Readonly<Record<string, IActionRoute>>;

  constructor(props: {
    readonly onActivation?: ICallable;
    readonly actions?: Readonly<Record<string, IActionRoute>>;
  }) {
    const { onActivation, actions } = props;

    if (onActivation !== undefined) {
      this.onActivation = onActivation;
    }
    if (actions !== undefined) {
      this.actions = actions;
    }
  }
}

export const CanonicalRouteSchema = Schema.instanceOf(Route);
