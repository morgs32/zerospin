import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { adaptPayload } from '../decodeAndAdaptPayload/adaptPayload/adaptPayload.ts';
import {
  isOrdinaryContract,
  isServiceContract,
} from '../make/constructContractRelease.ts';
import { resolveContractVersion } from '../resolveContractVersion.ts';
import { ServiceContractRelease } from '../ServiceContractRelease.ts';
import type {
  IDecodedServiceCommand,
  IPreparedInvocation,
  IServiceContractRelease,
  IServiceSessionSubmissionInput,
} from '../types.ts';

import { prepareContractClaims } from './prepareContractClaims.ts';

/** Establish concrete service input before entering checked evaluation. */
export function prepareServiceInvocation<
  C extends IServiceContractRelease,
>(props: {
  contract: C & { readonly external?: undefined };
  command: IDecodedServiceCommand | IServiceSessionSubmissionInput;
  claims: Readonly<Record<string, unknown>> | null | undefined;
}) {
  const { contract, command, claims: inputClaims } = props;

  return Effect.gen(function* () {
    assertSameCoreInstance({
      value: contract,
      expected: ServiceContractRelease,
      kind: 'ServiceContractRelease',
    });
    if (!isServiceContract(contract)) {
      return yield* makeZerospinError('contract-family-mismatch');
    }
    if ('aggregateId' in command) {
      return yield* makeZerospinError(
        'contract-service-aggregate-id-forbidden',
      );
    }
    if (!isOrdinaryContract(contract)) {
      return yield* makeZerospinError('external-contract-kind-mismatch');
    }
    if (command.commandName !== contract.commandName) {
      return yield* makeZerospinError('contract-command-name-mismatch');
    }
    const source = resolveContractVersion(contract, command.contractVersion);
    if (source === undefined) {
      return yield* makeZerospinError('contract-payload-version-unsupported');
    }
    const adapter = source.version > contract.version ? source : contract;
    const payload = yield* adaptPayload(adapter, {
      fromVersion: source.version,
      toVersion: contract.version,
      payload: command.payload,
    });
    const claims = yield* prepareContractClaims(contract, inputClaims);
    const invocation = {
      contract,
      command,
      payload,
      claims,
    };
    return Schema.decodeUnknownSync(
      Schema.declare<IPreparedInvocation<C>>(
        (value): value is IPreparedInvocation<C> =>
          typeof value === 'object' &&
          value !== null &&
          'contract' in value &&
          value.contract === contract,
      ),
    )(invocation);
  });
}
