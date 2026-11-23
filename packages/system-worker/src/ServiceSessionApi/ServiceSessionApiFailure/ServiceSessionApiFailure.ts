import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';

import type { ServiceSessionApi } from '../ServiceSessionApi.js';

/** Terminal refusal: ignore new requests and preserve the retained encoded admission outcome. */
export class ServiceSessionApiFailure<
  E extends IZerospinErrorJson = IZerospinErrorJson,
> extends RpcTarget {
  readonly #error: E;

  constructor(error: E) {
    super();
    this.#error = error;
  }

  async getSnapshot(_request: Parameters<ServiceSessionApi['getSnapshot']>[0]) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async registerNode(
    _request: Parameters<ServiceSessionApi['registerNode']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async getBrowserCommands(
    _request: Parameters<ServiceSessionApi['getBrowserCommands']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async createWebSocketTicket(
    _request: Parameters<ServiceSessionApi['createWebSocketTicket']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }
}
