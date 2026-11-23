import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';

import { AggregateAccessApiFailure } from '../../AggregateAccessApi/AggregateAccessApiFailure/AggregateAccessApiFailure.js';
import type { AggregateApi } from '../AggregateApi.js';

/** Terminal refusal: ignore new requests and preserve the retained encoded authentication outcome. */
export class AggregateApiFailure<
  E extends IZerospinErrorJson = IZerospinErrorJson,
> extends RpcTarget {
  readonly #error: E;

  constructor(error: E) {
    super();
    this.#error = error;
  }

  async authenticate(_request: Parameters<AggregateApi['authenticate']>[0]) {
    return new AggregateAccessApiFailure(this.#error);
  }
}
