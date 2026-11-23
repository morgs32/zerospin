import '@zerospin/server-only';
import type { Schema } from 'effect';

import {
  isAggregateExternalContractDefinition,
  type IAggregateExternalContractDefinition,
} from '../defineAggregateExternalContract.ts';
import type {
  IExternalContractDefinition,
  IExternalReleaseImplementation,
} from '../externalContract.ts';
import type { IAggregateContractRelease, IContractRelease } from '../types.ts';

import {
  constructExternalContract,
  readConstructedContract,
  type IPayloadFieldDescriptor,
} from './constructContractRelease.ts';

/** Bind a portable external declaration to its request and ordinary continuations. */
export function makeAggregateExternalContractRelease<
  const NAME extends string,
  const VERSION extends number,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  RESPONSE extends Schema.Codec<unknown, unknown>,
  const SUCCESS extends IAggregateContractRelease = IAggregateContractRelease,
  const FAILURE extends IAggregateContractRelease = IAggregateContractRelease,
  SERVICES = never,
  SUCCESS_SERVICES = never,
  FAILURE_SERVICES = never,
>(
  definition: IAggregateExternalContractDefinition<
    NAME,
    VERSION,
    PAYLOAD,
    RESPONSE
  >,
  implementation: IExternalReleaseImplementation<
    PAYLOAD,
    RESPONSE,
    SUCCESS,
    FAILURE,
    SERVICES,
    SUCCESS_SERVICES,
    FAILURE_SERVICES
  >,
) {
  if (!isAggregateExternalContractDefinition(definition)) {
    throw new Error(
      'Aggregate external implementation requires its exact pure definition',
    );
  }

  const contract = constructExternalContract(definition, implementation);
  return readConstructedContract<
    IAggregateContractRelease<
      Omit<IContractRelease<NAME, Readonly<PAYLOAD>, VERSION>, 'external'> & {
        readonly external: Omit<
          IExternalContractDefinition,
          'definition' | 'response' | 'request' | 'onSuccess' | 'onFailure'
        > & {
          readonly definition: typeof definition;
          readonly response: RESPONSE;
          readonly request: typeof implementation.request;
          readonly onSuccess: typeof implementation.onSuccess;
          readonly onFailure: typeof implementation.onFailure;
        };
      }
    >
  >(contract);
}
