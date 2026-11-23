import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';

import { ServiceAccessApiFailure } from '../../ServiceAccessApi/ServiceAccessApiFailure/ServiceAccessApiFailure.js';
import type { ServiceApi } from '../ServiceApi.js';

/** Terminal refusal: ignore new requests and preserve the retained encoded admission outcome. */
export class ServiceApiFailure<
  E extends IZerospinErrorJson = IZerospinErrorJson,
> extends RpcTarget {
  readonly #error: E;

  constructor(error: E) {
    super();
    this.#error = error;
  }

  async admit(_request: Parameters<ServiceApi['admit']>[0]) {
    return new ServiceAccessApiFailure(this.#error);
  }
}
