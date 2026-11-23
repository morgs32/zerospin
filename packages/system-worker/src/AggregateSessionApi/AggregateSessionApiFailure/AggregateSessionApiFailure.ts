import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';

import type { AggregateSessionApi } from '../AggregateSessionApi.js';

/** Terminal refusal: ignore new requests and preserve the retained encoded admission outcome. */
export class AggregateSessionApiFailure<
  E extends IZerospinErrorJson = IZerospinErrorJson,
> extends RpcTarget {
  readonly #error: E;

  constructor(error: E) {
    super();
    this.#error = error;
  }

  async getSnapshot(
    _request: Parameters<AggregateSessionApi['getSnapshot']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async registerNode(
    _request: Parameters<AggregateSessionApi['registerNode']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async createWebSocketTicket(
    _request: Parameters<AggregateSessionApi['createWebSocketTicket']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async getBrowserCommands(
    _request: Parameters<AggregateSessionApi['getBrowserCommands']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }
}
