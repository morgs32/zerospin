import * as Schema from 'effect/Schema';

/** Provenance marker for factory-produced Machine definitions. */
export class Machine {
  readonly states: unknown;
  readonly initial: unknown;
  readonly routes: unknown;

  constructor(props: {
    readonly states: unknown;
    readonly initial: unknown;
    readonly routes: unknown;
  }) {
    const { states, initial, routes } = props;

    this.states = states;
    this.initial = initial;
    this.routes = routes;
  }
}

export const CanonicalMachineSchema = Schema.instanceOf(Machine).check(
  Schema.makeFilter(machine =>
    Object.hasOwn(machine, 'states') &&
    Object.hasOwn(machine, 'initial') &&
    Object.hasOwn(machine, 'routes')
      ? undefined
      : 'Expected own Machine fields',
  ),
);
