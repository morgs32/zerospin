import type { IAnyError } from '@zerospin/error';
import type { IShape } from '@zerospin/shapes';
import type { Effect, Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IInferCommandPayload } from '../models/types.ts';

import type { IAggregateExternalContractDefinition } from './defineAggregateExternalContract.ts';
import type { IServiceExternalContractDefinition } from './defineServiceExternalContract.ts';
import type { IExternalRequestFailure } from './ExternalOutcomeSchema.ts';
import type { IContractRelease } from './types.ts';

/** An ordinary continuation and the payload authored for that contract. */
export type IExternalContinuation<
  CONTRACT extends IContractRelease = IContractRelease,
  INPUT = { payload: unknown },
  SERVICES = unknown,
> = Readonly<{
  contract: CONTRACT & {
    readonly external?: undefined;
    readonly claims?: undefined;
  };
  payload: {
    bivarianceHack(
      input: INPUT,
    ): Effect.Effect<
      IInferCommandPayload<NoInfer<CONTRACT['payload']>>,
      unknown,
      SERVICES
    >;
  }['bivarianceHack'];
}>;

export type IExternalReleaseImplementation<
  P extends IShape,
  X extends Schema.Codec<unknown, unknown>,
  SUCCESS extends IContractRelease,
  FAILURE extends IContractRelease,
  SERVICES,
  SUCCESS_SERVICES = never,
  FAILURE_SERVICES = never,
> = Readonly<{
  request: (input: {
    payload: IInferCommandPayload<P>;
  }) => Effect.Effect<X['Type'], IAnyError, SERVICES>;
  onSuccess: IExternalContinuation<
    SUCCESS,
    { payload: IInferCommandPayload<P>; response: X['Type'] },
    SUCCESS_SERVICES
  >;
  onFailure: IExternalContinuation<
    FAILURE,
    { payload: IInferCommandPayload<P>; failure: IExternalRequestFailure },
    FAILURE_SERVICES
  >;
}>;

/** Backend definition metadata; public session construction excludes these contracts. */
export interface IExternalContractDefinition {
  readonly definition:
    | IAggregateExternalContractDefinition
    | IServiceExternalContractDefinition;
  readonly response: Schema.Codec<unknown, unknown>;
  readonly timeoutMs: number;
  readonly request: {
    bivarianceHack(props: {
      payload: unknown;
    }): Effect.Effect<unknown, IAnyError, unknown>;
  }['bivarianceHack'];
  readonly onSuccess: IExternalContinuation<
    IContractRelease,
    { payload: unknown; response: unknown }
  >;
  readonly onFailure: IExternalContinuation<
    IContractRelease,
    { payload: unknown; failure: IExternalRequestFailure }
  >;
}

/** Selected principal grants retain exact ordinary contracts; invalid entries never disappear. */
export function assertOrdinaryContracts(
  contracts: Readonly<
    Record<string, Pick<IContractRelease, 'commandName' | 'external'>>
  >,
  context: string,
): void {
  mapValues(contracts, (contract, name) => {
    if (name !== contract.commandName || contract.external !== undefined) {
      throw new Error(
        `${context} contract ${name} must be an exact ordinary contract`,
      );
    }
  });
}
export type IInferExternalPayload<C extends IContractRelease> = C extends {
  readonly external: IExternalContractDefinition;
}
  ? IInferCommandPayload<C['payload']>
  : never;
