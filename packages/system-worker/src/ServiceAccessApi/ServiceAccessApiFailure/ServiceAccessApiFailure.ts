import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';

import { ServiceSessionApiFailure } from '../../ServiceSessionApi/ServiceSessionApiFailure/ServiceSessionApiFailure.js';
import type { ServiceAccessApi } from '../ServiceAccessApi.js';

/** Terminal refusal: ignore new requests and preserve the retained encoded admission outcome. */
export class ServiceAccessApiFailure<
  E extends IZerospinErrorJson = IZerospinErrorJson,
> extends RpcTarget {
  readonly #error: E;

  constructor(error: E) {
    super();
    this.#error = error;
  }

  async authorize(_request: Parameters<ServiceAccessApi['authorize']>[0]) {
    return new ServiceSessionApiFailure(this.#error);
  }
}
