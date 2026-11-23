import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { AggregateContractRelease } from '../AggregateContractRelease.ts';
import { adaptPayload } from '../decodeAndAdaptPayload/adaptPayload/adaptPayload.ts';
import {
  isAggregateContract,
  isOrdinaryContract,
} from '../make/constructContractRelease.ts';
import { resolveContractVersion } from '../resolveContractVersion.ts';
import type {
  IAggregateContractRelease,
  IDecodedAggregateCommand,
  IPreparedInvocation,
  IAggregateSessionSubmissionInput,
} from '../types.ts';

import { prepareContractClaims } from './prepareContractClaims.ts';

/** Establish concrete aggregate input before entering checked evaluation. */
export function prepareAggregateInvocation<
  C extends IAggregateContractRelease,
>(props: {
  contract: C & { readonly external?: undefined };
  command: IDecodedAggregateCommand | IAggregateSessionSubmissionInput;
  claims: Readonly<Record<string, unknown>> | null | undefined;
}) {
  const { contract, command, claims: inputClaims } = props;

  return Effect.gen(function* () {
    assertSameCoreInstance({
      value: contract,
      expected: AggregateContractRelease,
      kind: 'AggregateContractRelease',
    });
    if (!isAggregateContract(contract)) {
      return yield* makeZerospinError('contract-family-mismatch');
    }
    if (
      typeof command.aggregateId !== 'string' ||
      command.aggregateId.length === 0
    ) {
      return yield* makeZerospinError('contract-aggregate-id-required');
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
      aggregateId: command.aggregateId,
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
