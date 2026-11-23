import type { Effect } from 'effect';

import type {
  IContractReadDb,
  IContractReadOptions,
  IContractReadResult,
  IExactContractReadOptions,
} from './make/makeContractReadDb.ts';
export function findMany<
  DB extends IContractReadDb,
  MODEL extends DB['models'][keyof DB['models']],
  const Q extends IContractReadOptions<
    NoInfer<DB['models']>,
    MODEL['modelName'] & keyof DB['models'] & string
  > = {},
>(
  props: { db: DB; model: MODEL } & Q &
    IExactContractReadOptions<
      DB['models'],
      MODEL['modelName'] & keyof DB['models'] & string,
      NoInfer<Q>
    >,
): Effect.Effect<
  IContractReadResult<
    DB['models'],
    MODEL['modelName'] & keyof DB['models'] & string,
    Q
  >[]
> {
  const { db, model, ...options } = props;
  return db.read(model, options, false) as Effect.Effect<
    IContractReadResult<
      DB['models'],
      MODEL['modelName'] & keyof DB['models'] & string,
      Q
    >[]
  >;
}
