import '@zerospin/server-only';
import type { Schema } from 'effect';

import {
  isServiceExternalContractDefinition,
  type IServiceExternalContractDefinition,
} from '../defineServiceExternalContract.ts';
import type {
  IExternalContractDefinition,
  IExternalReleaseImplementation,
} from '../externalContract.ts';
import type { IContractRelease, IServiceContractRelease } from '../types.ts';

import {
  constructExternalContract,
  readConstructedContract,
  type IPayloadFieldDescriptor,
} from './constructContractRelease.ts';

/** Bind a portable external declaration to its request and ordinary continuations. */
export function makeServiceExternalContractRelease<
  const NAME extends string,
  const VERSION extends number,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  RESPONSE extends Schema.Codec<unknown, unknown>,
  const SUCCESS extends IServiceContractRelease = IServiceContractRelease,
  const FAILURE extends IServiceContractRelease = IServiceContractRelease,
  SERVICES = never,
  SUCCESS_SERVICES = never,
  FAILURE_SERVICES = never,
>(
  definition: IServiceExternalContractDefinition<
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
  if (!isServiceExternalContractDefinition(definition)) {
    throw new Error(
      'Service external implementation requires its exact pure definition',
    );
  }

  const contract = constructExternalContract(definition, implementation);
  return readConstructedContract<
    IServiceContractRelease<
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
