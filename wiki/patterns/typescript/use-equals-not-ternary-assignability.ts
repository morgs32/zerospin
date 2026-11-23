import { assert, Equals } from 'tsafe';

/**
 * Use Equals for exact parity — not extends ternary assignability checks.
 *
 * @bad assert<InferRow<typeof shape> extends IExpectedRow ? true : false>().
 */
assert<
  Equals<
    IInferRow<typeof aggregateCommandRowShape>,
    {
      readonly aggregateIndex: number;
      readonly commandId: IInferIdFromAbbreviation<'cmd'>;
      readonly result: string | null;
    }
  >
>();

declare type IInferRow<T> = unknown;
declare const aggregateCommandRowShape: unknown;
declare type IInferIdFromAbbreviation<A extends string> = `${A}_${string}`;
