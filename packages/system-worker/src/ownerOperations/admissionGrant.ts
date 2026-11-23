import type { DirectSystemServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

/** Check the supplied principal and exact contract against the supplied SystemSpec. */
export const checkAdmissionGrant = Effect.fn('checkAdmissionGrant')(function* (
  command:
    | IAggregateCommand
    | IServiceCommand
    | typeof DirectSystemServiceCommandSchema.Type,
  systemSpec: ISystemSpec,
) {
  const aggregate = 'aggregateName' in command;
  const owner = aggregate
    ? systemSpec.aggregates[command.aggregateName]
    : systemSpec.services[command.serviceName];
  const version = aggregate ? command.aggregateVersion : command.serviceVersion;
  const release = owner?.releases[version];
  const versionInInventory = release?.contracts[command.commandName];
  const contract =
    versionInInventory === undefined
      ? undefined
      : owner?.contractVersions[command.commandName]?.[versionInInventory];
  if (owner === undefined || release === undefined || contract === undefined) {
    return yield* makeZerospinError('command-admission-contract-unavailable');
  }
  let grant;
  if (command.kind === 'actor') {
    const actorVersion = release.actors[command.actorName];
    if (actorVersion === command.actorVersion) {
      grant =
        owner.actorVersions[command.actorName]?.[actorVersion]?.contracts[
          command.commandName
        ];
    }
  } else if (command.kind === 'agent') {
    const agent =
      owner.agentVersions[command.agentName]?.[command.agentVersion];
    if (agent?.ownerReleaseVersion === version) {
      grant = agent.contracts[command.commandName];
    }
  } else {
    grant = release.system[command.commandName];
  }
  if (
    grant !== command.contractVersion ||
    contract.version !== command.contractVersion ||
    contract.external !== undefined ||
    (command.kind !== 'actor' && contract.claimsJsonSchema !== null)
  ) {
    return yield* makeZerospinError('command-admission-grant-invalid');
  }
});
