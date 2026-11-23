import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';

import { AggregateSessionApiFailure } from '../../AggregateSessionApi/AggregateSessionApiFailure/AggregateSessionApiFailure.js';
import type { AggregateAccessApi } from '../AggregateAccessApi.js';

/** Terminal refusal: ignore new requests and preserve the retained encoded authentication outcome. */
export class AggregateAccessApiFailure<
  E extends IZerospinErrorJson = IZerospinErrorJson,
> extends RpcTarget {
  readonly #error: E;

  constructor(error: E) {
    super();
    this.#error = error;
  }

  async openSession(
    _request: Parameters<AggregateAccessApi['openSession']>[0],
  ) {
    return new AggregateSessionApiFailure(this.#error);
  }
}
