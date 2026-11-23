import {
  DirectSystemAggregateCommandSchema,
  DirectSystemServiceCommandSchema,
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { prepareContractClaims } from '@zerospin/core/contracts/prepare/prepareContractClaims';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { getOwnerReleaseBindingName } from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystem } from '@zerospin/core/system/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { validateSubmittedPayload } from '../AggregateChain/admitAggregateCommands/validateSubmittedPayload.js';
import { checkAdmission } from '../checkAdmission.js';
import { getSystemSpec } from '../getSystemSpec/getSystemSpec.js';
import { readAuthoredWorkerConfig } from '../workerConfiguration/workerConfiguration.js';

import { checkAdmissionGrant } from './admissionGrant.js';
import './ownerReleaseWorkerBindings.js';

export const AggregateAdmissionInputSchema = Schema.Union([
  EncodedAggregateCommandSchema,
  DirectSystemAggregateCommandSchema,
]);
export const ServiceAdmissionInputSchema = Schema.Union([
  EncodedServiceCommandSchema,
  DirectSystemServiceCommandSchema,
]);

export const validateNativeAggregateAdmission = Effect.fn(
  'validateNativeAggregateAdmission',
)(function* (
  command: typeof AggregateAdmissionInputSchema.Type,
  system: ISystem,
) {
  const { aggregateName, aggregateVersion } = command;
  const release = system.aggregates[aggregateName]?.releases[aggregateVersion];
  const contract = release?.contracts[command.commandName];
  if (
    contract === undefined ||
    contract.version !== command.contractVersion ||
    contract.external !== undefined ||
    (command.kind !== 'actor' && contract.claims !== undefined)
  ) {
    return yield* makeZerospinError('aggregate-chain-command-invalid');
  }
  if (command.kind === 'actor') {
    const actor = release?.actors[command.actorName];
    if (actor?.version !== command.actorVersion) {
      return yield* makeZerospinError('aggregate-chain-command-invalid');
    }
    const claims = yield* Schema.decodeUnknownEffect(
      actor.identity.claimsSchema,
    )(command.claims, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'command-claims-unsupported',
        prefix: 'Invalid Actor admission claims',
      }),
    );
    if (claims.aggregateId !== command.aggregateId) {
      return yield* makeZerospinError('aggregate-command-scope-mismatch');
    }
    yield* prepareContractClaims(contract, claims);
  }
  yield* validateSubmittedPayload(contract, command.payload);
});

export const validateNativeServiceAdmission = Effect.fn(
  'validateNativeServiceAdmission',
)(function* (
  command: typeof ServiceAdmissionInputSchema.Type,
  system: ISystem,
) {
  const { serviceName, serviceVersion } = command;
  const release = system.services[serviceName]?.releases[serviceVersion];
  const contract = release?.contracts[command.commandName];
  if (command.kind !== 'actor' && contract?.claims !== undefined) {
    return yield* makeZerospinError('service-command-invalid');
  }
  yield* checkAdmission({ command, contract });
  if (command.kind === 'actor' && contract !== undefined) {
    const actor = release?.actors[command.actorName];
    if (actor?.version !== command.actorVersion) {
      return yield* makeZerospinError('admission-contract-not-found');
    }
    const claims = yield* Schema.decodeUnknownEffect(
      actor.identity.claimsSchema,
    )(command.claims, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-command-claims-invalid',
        prefix: 'Invalid Actor admission claims',
      }),
    );
    yield* prepareContractClaims(contract, claims);
  }
});

/** Ask the addressed release before starting a root Chain transaction. */
export const validateReleaseAdmission = Effect.fn('validateReleaseAdmission')(
  function* (
    command:
      | IEncodedCommand<IAggregateCommand | IServiceCommand>
      | typeof DirectSystemAggregateCommandSchema.Type
      | typeof DirectSystemServiceCommandSchema.Type,
  ) {
    const bindingName = getOwnerReleaseBindingName(command);
    const release = env[bindingName];
    const aggregate = 'aggregateName' in command;
    const serviceWorker = env.ZEROSPIN_HOSTED_SERVICE_DISPATCH ?? release;
    // A staged executor can already answer RPC while its release is still unpublished.
    const registered =
      !aggregate && env.ZEROSPIN_HOSTED_SERVICE_DISPATCH
        ? yield* getSystemSpec(env.ZEROSPIN_SYSTEM_ID, {
            serviceName: command.serviceName,
            serviceVersion: command.serviceVersion,
          })
        : undefined;
    if (registered && !aggregate)
      yield* checkAdmissionGrant(command, registered);
    const validate = aggregate
      ? release &&
        (() =>
          release.validateAggregateAdmission(env.ZEROSPIN_SYSTEM_ID, command))
      : serviceWorker &&
        (() =>
          serviceWorker.validateServiceAdmission(
            env.ZEROSPIN_SYSTEM_ID,
            command,
          ));
    if (validate === undefined) {
      const local = readAuthoredWorkerConfig();
      const namespace = aggregate
        ? env.AGGREGATE_VERSION_REPO
        : env.SERVICE_VERSION_REPO;
      if (local === undefined || namespace === undefined) {
        return yield* makeZerospinError(
          'command-admission-release-unavailable',
        );
      }
      if (aggregate)
        yield* validateNativeAggregateAdmission(command, local.system);
      else yield* validateNativeServiceAdmission(command, local.system);
      return undefined;
    }
    const result = yield* Effect.tryPromise({
      try: validate,
      catch: error =>
        ensureZerospinError({
          code: 'command-admission-release-unavailable',
          error,
        }),
    }).pipe(
      Effect.timeoutOrElse({
        duration: '30 seconds',
        orElse: () =>
          Effect.fail(
            makeZerospinError({
              code: 'command-admission-release-unavailable',
              message:
                'Owner release did not validate command admission in time',
            }),
          ),
      }),
    );
    yield* readRpcEnvelope(result);
    return registered;
  },
);
