import { PrimitiveKind } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';
import { isEqual, mapValues } from 'es-toolkit';

import { AgentReleaseSpecSchema } from '../agent/AgentReleaseSpecSchema.ts';
import { AggregateSpecSchema } from '../aggregate/AggregateSpecSchema.ts';
import { ContractSpecSchema } from '../contracts/ContractSpecSchema.ts';
import { normalizeReadField } from '../contracts/readProjection.ts';
import {
  AggregateActorSpecSchema,
  ServiceActorSpecSchema,
} from '../declaration/ReleaseSpecSchemas.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';
import { ModelSpecSchema } from '../models/ModelSpecSchema.ts';
import { ServiceSpecSchema } from '../service/ServiceSpecSchema.ts';

const modelVersions = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, ModelSpecSchema),
);
const contractVersions = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, ContractSpecSchema),
);
const agentVersions = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, AgentReleaseSpecSchema),
);
const aggregateOwner = Schema.Struct({
  releases: Schema.Record(Schema.String, AggregateSpecSchema).check(
    Schema.isMinProperties(1),
  ),
  modelVersions,
  contractVersions,
  actorVersions: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, AggregateActorSpecSchema),
  ),
  agentVersions,
});
const serviceOwner = Schema.Struct({
  releases: Schema.Record(Schema.String, ServiceSpecSchema),
  modelVersions,
  contractVersions,
  actorVersions: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, ServiceActorSpecSchema),
  ),
  agentVersions,
});
const systemSpecFields = {
  systemName: Schema.String,
  aggregates: Schema.Record(Schema.String, aggregateOwner),
  services: Schema.Record(Schema.String, serviceOwner),
  aggregateAgents: Schema.Record(
    Schema.String,
    Schema.Record(
      Schema.String,
      Schema.Struct({
        aggregateVersion: VersionSchema,
        agentVersion: VersionSchema,
      }),
    ),
  ),
  serviceAgents: Schema.Record(
    Schema.String,
    Schema.Record(
      Schema.String,
      Schema.Struct({
        serviceVersion: VersionSchema,
        agentVersion: VersionSchema,
      }),
    ),
  ),
};
const bodySchema = Schema.Struct(systemSpecFields);

type IOwner = typeof aggregateOwner.Type | typeof serviceOwner.Type;
type IRelease = typeof AggregateSpecSchema.Type | typeof ServiceSpecSchema.Type;
type IContract = typeof ContractSpecSchema.Type;
type IActor =
  | typeof AggregateActorSpecSchema.Type
  | typeof ServiceActorSpecSchema.Type;

/** Limited Actor projections retain their canonical identity and selected descriptors. */
function validProjection(
  projection: typeof ModelSpecSchema.Type,
  canonical: typeof ModelSpecSchema.Type | undefined,
) {
  if (
    canonical === undefined ||
    projection.modelName !== canonical.modelName ||
    projection.version !== canonical.version ||
    projection.abbreviation !== canonical.abbreviation
  ) {
    return false;
  }
  const resourceFields = [
    'id',
    'modelName',
    'version',
    'createdAt',
    'updatedAt',
  ];
  return (
    resourceFields.every(field =>
      Object.hasOwn(projection.propertiesShape, field),
    ) &&
    projection.attributes.every(field =>
      canonical.attributes.includes(field),
    ) &&
    Object.keys(projection.propertiesShape).every(field =>
      isEqual(
        projection.propertiesShape[field],
        canonical.propertiesShape[field],
      ),
    )
  );
}

function validateOwner(owner: IOwner, ownerName: string) {
  let failure: string | undefined;
  const reject = (message: string) => {
    failure ??= message;
  };
  mapValues(owner.modelVersions, (versions, modelName) =>
    mapValues(versions, (model, version) => {
      if (model.modelName !== modelName || String(model.version) !== version) {
        reject(
          `Model ${ownerName}.${modelName}@${version} identity must match its registry`,
        );
      }
    }),
  );
  const requireModel = (
    modelName: string,
    version: number,
    context: string,
  ) => {
    const model = owner.modelVersions[modelName]?.[version];
    if (model === undefined) {
      reject(`${context} refers to missing model ${modelName}@${version}`);
    }
    return model;
  };
  mapValues(owner.contractVersions, (versions, commandName) =>
    mapValues(versions, (contract, version) => {
      if (
        contract.commandName !== commandName ||
        String(contract.version) !== version
      ) {
        reject(
          `Contract ${ownerName}.${commandName}@${version} identity must match its registry`,
        );
      }
      const projectedModels = new Set(Object.keys(contract.models));
      mapValues(contract.models, (projection, modelName) => {
        const id = projection.fields.id;
        if (
          id === undefined ||
          id.kind !== PrimitiveKind.Id ||
          !id.primaryKey ||
          id.abbreviation !== projection.abbreviation
        ) {
          reject(
            `Contract ${ownerName}.${commandName}@${version} has an invalid read identity for ${modelName}`,
          );
        }
        if (
          !Object.values(owner.modelVersions[modelName] ?? {}).some(
            model => model.abbreviation === projection.abbreviation,
          )
        ) {
          reject(
            `Contract ${ownerName}.${commandName}@${version} has an unknown read model ${modelName}`,
          );
        }
        mapValues(projection.fields, (field, fieldName) => {
          if (!isEqual(field, normalizeReadField(field, projectedModels))) {
            reject(
              `Contract ${ownerName}.${commandName}@${version} has a non-normalized read field ${modelName}.${fieldName}`,
            );
          }
        });
      });
      for (const operation of contract.operations) {
        if ('model' in operation) {
          requireModel(
            operation.model.modelName,
            operation.model.version,
            `Contract ${ownerName}.${commandName}@${version} operation`,
          );
        }
      }
    }),
  );
  const validateContractReferences = (
    bindings: Readonly<Record<string, number>>,
    context: string,
  ) => {
    mapValues(bindings, (contractVersion, commandName) => {
      if (
        owner.contractVersions[commandName]?.[contractVersion] === undefined
      ) {
        reject(
          `${context} refers to missing contract ${commandName}@${contractVersion}`,
        );
      }
    });
  };
  mapValues(owner.actorVersions, (versions, actorName) =>
    mapValues(versions, (actor, version) => {
      if (actor.name !== actorName || String(actor.version) !== version) {
        reject(
          `Actor ${ownerName}.${actorName}@${version} identity must match its registry`,
        );
      }
      validateContractReferences(
        actor.contracts,
        `Actor ${ownerName}.${actorName}@${version}`,
      );
      mapValues(actor.exposedModels, (projection, modelName) => {
        if (
          projection.modelName !== modelName ||
          !validProjection(
            projection,
            requireModel(modelName, projection.version, `Actor ${actorName}`),
          )
        ) {
          reject(
            `Actor ${ownerName}.${actorName} projection must retain its canonical model facts`,
          );
        }
      });
      mapValues(actor.selections, (selection, modelName) => {
        if (
          selection.modelName !== modelName ||
          !Object.hasOwn(actor.exposedModels, modelName)
        ) {
          reject(
            `Actor ${ownerName}.${actorName} selection requires its exposed model`,
          );
        }
      });
    }),
  );
  mapValues(owner.agentVersions, (versions, agentName) =>
    mapValues(versions, (agent, version) => {
      if (agent.name !== agentName || String(agent.agentVersion) !== version) {
        reject(
          `Agent ${ownerName}.${agentName}@${version} identity must match its registry`,
        );
      }
      if (owner.releases[agent.ownerReleaseVersion] === undefined) {
        reject(
          `Agent ${ownerName}.${agentName} requires its exact owner release`,
        );
      }
      mapValues(agent.wakeRules, modelName => {
        if (!Object.hasOwn(agent.selections, modelName)) {
          reject(`Agent wake rule requires a selected model: ${modelName}`);
        }
      });
      validateContractReferences(
        agent.contracts,
        `Agent ${ownerName}.${agentName}@${version}`,
      );
      mapValues(agent.models, (model, modelName) => {
        requireModel(modelName, model.version, `Agent ${agentName}`);
      });
      mapValues(agent.selections, (selection, modelName) => {
        if (
          selection.modelName !== modelName ||
          !Object.hasOwn(agent.models, modelName)
        ) {
          reject(
            `Agent ${ownerName}.${agentName} selection requires its model`,
          );
        }
      });
    }),
  );
  function validateContractModels(
    contract: Pick<IContract, 'commandName' | 'models' | 'operations'>,
    release: IRelease,
    actor?: IActor,
  ) {
    const projectedModels = new Set(Object.keys(contract.models));
    const requireBoundModel = (modelName: string, version: number) => {
      if (release.models[modelName] !== version) {
        reject(
          `Contract ${ownerName}.${contract.commandName} model must match its release binding`,
        );
      }
      if (
        actor &&
        !isEqual(
          actor.exposedModels[modelName],
          owner.modelVersions[modelName]?.[version],
        )
      ) {
        reject(
          `Actor ${ownerName}.${actor.name} command requires its complete canonical model`,
        );
      }
    };
    mapValues(contract.models, (projection, modelName) => {
      const version = release.models[modelName];
      const model =
        version === undefined
          ? undefined
          : owner.modelVersions[modelName]?.[version];
      const exposed = actor?.exposedModels[modelName];
      if (
        model === undefined ||
        model.abbreviation !== projection.abbreviation ||
        (actor !== undefined && exposed === undefined)
      ) {
        reject(
          `Contract ${ownerName}.${contract.commandName} read model ${modelName} is unavailable`,
        );
        return;
      }
      mapValues(projection.fields, (expected, field) => {
        const actual = model.propertiesShape[field];
        const visible = exposed?.propertiesShape[field];
        const normalized = (descriptor: typeof actual) =>
          descriptor === undefined
            ? undefined
            : normalizeReadField(descriptor, projectedModels);
        if (
          !isEqual(expected, normalized(actual)) ||
          (actor !== undefined && !isEqual(expected, normalized(visible)))
        ) {
          reject(
            `Contract ${ownerName}.${contract.commandName} read field ${modelName}.${field} is incompatible`,
          );
        }
      });
    });
    for (const operation of contract.operations) {
      if ('model' in operation) {
        requireBoundModel(operation.model.modelName, operation.model.version);
      }
    }
  }
  mapValues(owner.releases, (release, version) => {
    if (release.name !== ownerName || String(release.version) !== version) {
      reject('Owner release identity must match its registry');
    }
    mapValues(release.models, (modelVersion, modelName) => {
      requireModel(modelName, modelVersion, `Release ${ownerName}@${version}`);
    });
    mapValues(release.contracts, (contractVersion, commandName) => {
      const contract = owner.contractVersions[commandName]?.[contractVersion];
      if (contract === undefined) {
        reject(
          `Release ${ownerName}@${version} refers to missing contract ${commandName}@${contractVersion}`,
        );
      } else {
        validateContractModels(contract, release);
      }
    });
    const continuations = new Set<string>();
    const validateContinuation = (branch: {
      readonly commandName: string;
      readonly version: number;
    }): void => {
      const { commandName, version } = branch;
      continuations.add(commandName);
      const contract = owner.contractVersions[commandName]?.[version];
      if (
        release.contracts[commandName] !== version ||
        contract === undefined ||
        contract.claimsJsonSchema !== null ||
        contract.external !== undefined
      ) {
        reject(
          'Operation continuation must match an exact claims-free ordinary contract in the owner release inventory',
        );
      }
    };
    if ('extensions' in release && release.extensions !== undefined) {
      mapValues(release.extensions, (extension, commandName) => {
        if (release.contracts[commandName] !== extension.sourceVersion) {
          reject('Extension source must match its owner release contract');
        }
        validateContractModels(
          {
            commandName,
            models: extension.models,
            operations: extension.operations,
          },
          release,
        );
        for (const operation of extension.operations) {
          if (
            'model' in operation &&
            release.models[operation.model.modelName] !==
              operation.model.version
          ) {
            reject('Extension operation model must match its owner release');
          }
          if (
            operation.operationName === 'external' &&
            release.external[operation.contractName] !==
              operation.contractVersion
          ) {
            reject('Extension external operation must match its owner grant');
          }
          if (operation.operationName === 'command') {
            for (const branch of [operation.onSuccess, operation.onFailure]) {
              if (branch !== undefined) validateContinuation(branch);
            }
          }
        }
      });
    }
    const granted = new Set<string>();
    const validateGrants = (
      grants: Readonly<Record<string, number>>,
      context: string,
      external: boolean,
      claims: boolean,
      actor?: IActor,
    ) => {
      mapValues(grants, (contractVersion, commandName) => {
        granted.add(commandName);
        const contract = owner.contractVersions[commandName]?.[contractVersion];
        if (
          release.contracts[commandName] !== contractVersion ||
          contract === undefined
        ) {
          reject(`${context} contract must match its release binding`);
        } else if (
          (contract.external !== undefined) !== external ||
          (!claims && contract.claimsJsonSchema !== null)
        ) {
          reject(
            `${context} contract has incompatible external or claims metadata`,
          );
        } else if (actor) {
          validateContractModels(contract, release, actor);
        }
      });
    };
    validateGrants(release.system, 'System grant', false, false);
    validateGrants(release.external, 'External grant', true, false);
    mapValues(release.external, (contractVersion, commandName) => {
      const request =
        owner.contractVersions[commandName]?.[contractVersion]?.external;
      if (request !== undefined) {
        validateContinuation(request.onSuccess);
        validateContinuation(request.onFailure);
      }
    });
    mapValues(release.actors, (actorVersion, actorName) => {
      const actor = owner.actorVersions[actorName]?.[actorVersion];
      if (actor === undefined) {
        reject(
          `Release ${ownerName}@${version} refers to missing Actor ${actorName}@${actorVersion}`,
        );
        return;
      }
      mapValues(actor.exposedModels, (model, modelName) => {
        if (release.models[modelName] !== model.version) {
          reject(
            `Actor ${ownerName}.${actorName} model must match its release binding`,
          );
        }
      });
      validateGrants(actor.contracts, 'Actor grant', false, true, actor);
    });
    mapValues(owner.agentVersions, (versions, agentName) =>
      mapValues(versions, agent => {
        if (agent.ownerReleaseVersion !== Number(version)) return;
        mapValues(agent.models, (model, modelName) => {
          if (
            release.models[modelName] !== model.version ||
            !validProjection(
              model,
              owner.modelVersions[modelName]?.[model.version],
            )
          ) {
            reject(
              `Agent ${ownerName}.${agentName} view must match its owner release`,
            );
          }
        });
        validateGrants(agent.contracts, 'Agent grant', false, false);
      }),
    );
    mapValues(release.contracts, (contractVersion, commandName) => {
      const contract = owner.contractVersions[commandName]?.[contractVersion];
      for (const operation of contract?.operations ?? []) {
        if (
          operation.operationName === 'external' &&
          release.external[operation.contractName] !== operation.contractVersion
        ) {
          reject('External operation must match the owner external grant');
        }
        if (operation.operationName === 'command') {
          for (const branch of [operation.onSuccess, operation.onFailure]) {
            if (branch !== undefined) validateContinuation(branch);
          }
        }
      }
    });
    for (const commandName of continuations) {
      if (granted.has(commandName)) {
        reject('Continuation contracts cannot have direct invocation grants');
      }
    }
  });
  return failure;
}

function validateReferences(spec: typeof bodySchema.Type) {
  if (!Schema.is(Schema.Json)(spec)) {
    return 'SystemSpec metadata must contain only JSON values';
  }
  let failure: string | undefined;
  mapValues(spec.aggregates, (owner, ownerName) => {
    failure ??= validateOwner(owner, ownerName);
    const firstVersion = Math.min(
      ...Object.values(owner.releases).map(release => release.version),
    );
    mapValues(owner.releases, release => {
      const predecessor = release.branchFrom ?? release.rebuildFrom;
      if (predecessor === undefined && release.version !== firstVersion) {
        failure ??= `Aggregate ${ownerName}@${release.version} must name a predecessor`;
      }
      if (
        predecessor !== undefined &&
        (predecessor >= release.version ||
          !Object.hasOwn(owner.releases, predecessor))
      ) {
        failure ??= `Aggregate ${ownerName}@${release.version} must name a registered earlier release of the same Aggregate as its predecessor`;
      }
    });
  });
  mapValues(spec.services, (owner, ownerName) => {
    const serviceVersions = Object.values(owner.releases).map(
      release => release.version,
    );
    const firstServiceVersion =
      serviceVersions.length === 0 ? undefined : Math.min(...serviceVersions);
    mapValues(owner.releases, release => {
      const predecessor = release.branchFrom ?? release.rebuildFrom;
      if (
        predecessor === undefined &&
        release.version !== firstServiceVersion
      ) {
        failure ??= `Service ${ownerName}@${release.version} must name a predecessor`;
      }
      if (
        predecessor !== undefined &&
        (predecessor >= release.version ||
          !Object.hasOwn(owner.releases, predecessor))
      ) {
        failure ??= `Service ${ownerName}@${release.version} must name a registered earlier release of the same Service as its predecessor`;
      }
    });
    failure ??= validateOwner(owner, ownerName);
  });
  mapValues(spec.aggregateAgents, (nodes, aggregateName) =>
    mapValues(nodes, (node, agentName) => {
      const owner = Object.hasOwn(spec.aggregates, aggregateName)
        ? spec.aggregates[aggregateName]
        : undefined;
      const release = owner?.releases[node.aggregateVersion];
      if (
        release === undefined ||
        spec.aggregates[aggregateName]?.agentVersions[agentName]?.[
          node.agentVersion
        ]?.ownerReleaseVersion !== node.aggregateVersion
      ) {
        failure ??= `Aggregate Node ${aggregateName}.${agentName} has no registered Agent`;
      }
    }),
  );
  mapValues(spec.serviceAgents, (nodes, serviceName) =>
    mapValues(nodes, (node, agentName) => {
      const owner = Object.hasOwn(spec.services, serviceName)
        ? spec.services[serviceName]
        : undefined;
      const release = owner?.releases[node.serviceVersion];
      if (
        release === undefined ||
        owner?.agentVersions[agentName]?.[node.agentVersion]
          ?.ownerReleaseVersion !== node.serviceVersion
      ) {
        failure ??= `Service Node ${serviceName}.${agentName} has no registered Agent`;
      }
    }),
  );
  return failure ?? true;
}

/** Complete normalized declarations before attaching their content identity. */
export const SystemSpecBodySchema = bodySchema.check(
  Schema.makeFilter(validateReferences),
);
export const SystemSpecSchema = Schema.Struct({
  ...systemSpecFields,
  hash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
}).check(Schema.makeFilter(validateReferences));
