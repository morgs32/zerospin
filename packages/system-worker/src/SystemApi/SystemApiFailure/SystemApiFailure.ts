import type { ISystemApiRpc } from '@zerospin/core/systemApi/ISystemApiRpc';
import type { IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';

/** Terminal refusal: ignore new requests and preserve the retained encoded admission outcome. */
export class SystemApiFailure<E extends IZerospinErrorJson = IZerospinErrorJson>
  extends RpcTarget
  implements ISystemApiRpc
{
  readonly #error: E;

  constructor(error: E) {
    super();
    this.#error = error;
  }

  async healthcheck(_request: Parameters<ISystemApiRpc['healthcheck']>[0]) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async initialize(_request: Parameters<ISystemApiRpc['initialize']>[0]) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async executeServiceQuery(
    _request: Parameters<ISystemApiRpc['executeServiceQuery']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async executeAggregateCommand(
    _request: Parameters<ISystemApiRpc['executeAggregateCommand']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async executeAggregateQuery(
    _request: Parameters<ISystemApiRpc['executeAggregateQuery']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async executeServiceCommand(
    _request: Parameters<ISystemApiRpc['executeServiceCommand']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async preflightDeployment(
    _request: Parameters<ISystemApiRpc['preflightDeployment']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async acceptSystemSpec(
    _request: Parameters<ISystemApiRpc['acceptSystemSpec']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async getExecutingWorkerVersion(
    _request: Parameters<ISystemApiRpc['getExecutingWorkerVersion']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async getRepoRegistrations(
    _request: Parameters<ISystemApiRpc['getRepoRegistrations']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async getRepoTableRows(
    _request: Parameters<ISystemApiRpc['getRepoTableRows']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async makeSystemSpec(
    _request: Parameters<ISystemApiRpc['makeSystemSpec']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async openAggregateAgentSession(
    _request: Parameters<ISystemApiRpc['openAggregateAgentSession']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async openServiceAgentSession(
    _request: Parameters<ISystemApiRpc['openServiceAgentSession']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }

  async getAgentAggregateIds(
    _request: Parameters<ISystemApiRpc['getAgentAggregateIds']>[0],
  ) {
    return {
      result: { _tag: 'Failure' as const, failure: this.#error },
      link: null,
    };
  }
}
