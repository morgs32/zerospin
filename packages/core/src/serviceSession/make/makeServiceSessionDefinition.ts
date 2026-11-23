import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { assertClaimsRequirements } from '../../aggregateActor/make/makeAggregateActorRelease/assertClaimsRequirements/assertClaimsRequirements.ts';
import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { assertOrdinaryContracts } from '../../contracts/externalContract.ts';
import { isServiceContract } from '../../contracts/make/constructContractRelease.ts';
import type {
  IServiceContractRelease,
  IServiceContracts,
} from '../../contracts/types.ts';
import { validateContractModels } from '../../declaration/validateActorContracts.ts';
import { VersionSchema } from '../../declaration/VersionSchema.ts';
import { assertValidModels } from '../../models/assertValidModels.ts';
import { Model } from '../../models/defineModel.ts';
import { isModel } from '../../models/make/makeModelVersion.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
} from '../../models/types.ts';
import type { IServiceSessionDefinition } from '../types.ts';
const CanonicalModelSchema = Schema.declare((input: unknown): input is IModel =>
  isModel(input),
);
const ModelsRecordSchema = Schema.Record(Schema.String, CanonicalModelSchema);
const ClaimsSchema = Schema.declare(
  (
    input: unknown,
  ): input is Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > =>
    Schema.isSchema(input) && 'fields' in input && input.ast._tag === 'Objects',
);
export const ServiceSessionPropsSchema = Schema.Struct({
  systemName: Schema.String,
  actorName: Schema.String,
  actorVersion: VersionSchema,
  claimsSchema: ClaimsSchema,
  serviceName: Schema.String,
  serviceVersion: VersionSchema,
  sessionName: Schema.String,
  contracts: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.declare((value: unknown): value is IServiceContractRelease =>
        isServiceContract(value),
      ),
    ),
  ),
  models: ModelsRecordSchema,
});
/**
 * Authored service session definition. No app, Provider, or runtime.
 * The constructor captures the complete system/service/actor identity.
 */
export function makeServiceSessionDefinition<
  const SYSTEM_NAME extends string,
  const SERVICE_NAME extends string,
  const ACTOR_NAME extends string,
  const ACTOR_VERSION extends number,
  const SERVICE_VERSION extends number,
  const DEFINITION_NAME extends string,
  const MODELS extends IAnyModels,
  const CLAIMS extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  >,
  const CONTRACTS extends IServiceContracts = {},
>(
  props: {
    systemName: SYSTEM_NAME;
    actorName: ACTOR_NAME;
    actorVersion: ACTOR_VERSION;
    serviceName: SERVICE_NAME;
    serviceVersion: SERVICE_VERSION;
    sessionName: DEFINITION_NAME;
    claimsSchema: CLAIMS;
    contracts?: CONTRACTS;
    models: MODELS &
      IAssertValidModels<NoInfer<MODELS>> & {
        [K in keyof MODELS]: MODELS[K];
      };
  } & (keyof CONTRACTS extends never ? unknown : { contracts: CONTRACTS }),
): Readonly<
  Omit<
    IServiceSessionDefinition<
      SYSTEM_NAME,
      SERVICE_NAME,
      DEFINITION_NAME,
      MODELS,
      SERVICE_VERSION,
      CLAIMS
    >,
    'contracts' | 'actorName' | 'actorVersion'
  > & {
    actorName: ACTOR_NAME;
    actorVersion: ACTOR_VERSION;
    contracts: Readonly<CONTRACTS>;
  }
>;
export function makeServiceSessionDefinition(props: unknown): unknown {
  if (typeof props === 'object' && props !== null) {
    const models = 'models' in props ? props.models : undefined;
    if (typeof models === 'object' && models !== null) {
      mapValues(models, value =>
        assertSameCoreInstance({ value, expected: Model, kind: 'Model' }),
      );
    }
  }
  const decodedProps = Schema.decodeUnknownSync(ServiceSessionPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const {
    systemName,
    actorName,
    actorVersion,
    serviceName,
    serviceVersion,
    sessionName,
    claimsSchema,
    contracts = {},
    models: authoredModels,
  } = decodedProps;
  assertOrdinaryContracts(contracts, `Service session ${sessionName}`);
  mapValues(contracts, (contract, name) => {
    if (contract.claims !== undefined) {
      assertClaimsRequirements(claimsSchema, contract.claims);
    }
    validateContractModels({
      entry: contract,
      models: authoredModels,
      context: `Service session ${sessionName}.${name}`,
    });
  });
  const models = { ...authoredModels };
  const modelNames = Object.keys(models);
  assertValidModels({ models, context: 'makeServiceSessionDefinition' });
  return {
    kind: 'service',
    systemName,
    actorName,
    actorVersion,
    claimsSchema,
    serviceName,
    serviceVersion,
    sessionName,
    contracts: { ...contracts },
    models,
    modelNames,
  };
}
