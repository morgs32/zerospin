import type { getSystemApi } from '@zerospin/core/utils/getSystemApi/getSystemApi';
import type { IAnyError } from '@zerospin/sdk';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

export class ShoppingSystemApi extends Context.Service<
  ShoppingSystemApi,
  Effect.Effect<
    Pick<
      Effect.Success<ReturnType<typeof getSystemApi>>,
      'executeServiceCommand' | 'executeServiceQuery'
    >,
    IAnyError
  >
>()('ShoppingSystemApi') {}
