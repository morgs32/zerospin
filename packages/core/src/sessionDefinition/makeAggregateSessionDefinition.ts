import type { ITypeError } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';
import * as SchemaAST from 'effect/SchemaAST';
import { mapValues } from 'es-toolkit';

import { assertClaimsRequirements } from '../aggregateActor/make/makeAggregateActorRelease/assertClaimsRequirements/assertClaimsRequirements.ts';
import type { IAggregateSessionDefinition } from '../aggregateSession/types.ts';
import { assertSameCoreInstance } from '../assertSameCoreInstance.ts';
import type { IAssertContractOperationsInModels } from '../contracts/assertOperationsUseModels.ts';
import { assertOrdinaryContracts } from '../contracts/externalContract.ts';
import { isAggregateContract } from '../contracts/make/constructContractRelease.ts';
import type {
  IAggregateContractRelease,
  IAggregateContracts,
} from '../contracts/types.ts';
import { validateContractModels } from '../declaration/validateActorContracts.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';
import type { IClaimsSchema } from '../identity/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/defineModel.ts';
import { isModel } from '../models/make/makeModelVersion.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
} from '../models/types.ts';

const CanonicalModelSchema = Schema.declare((input: unknown): input is IModel =>
  isModel(input),
);

const ContractSchema = Schema.declare(
  (input: unknown): input is IAggregateContractRelease =>
    isAggregateContract(input),
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

const AggregateSessionPropsSchema = Schema.Struct({
  claimsSchema: ClaimsSchema,
  aggregateName: Schema.String,
  aggregateVersion: VersionSchema,
  actorName: Schema.String,
  actorVersion: VersionSchema,
  sessionName: Schema.String,
  contracts: Schema.Record(Schema.String, ContractSchema),
  models: ModelsRecordSchema,
});

/** Validate authored aggregate composition without acquiring a session lifetime. */
type IAggregateSessionDefinitionProps = {
  systemName: string;
  sessionName: string;
  actorName: string;
  actorVersion: number;
  claimsSchema: IClaimsSchema;
  models: IAnyModels;
  aggregateName: string;
  aggregateVersion: number;
  contracts: IAggregateContracts;
};

export function makeAggregateSessionDefinition<
  const P extends IAggregateSessionDefinitionProps,
>(
  props: P & {
    models: IAssertValidModels<NoInfer<P['models']>>;
    contracts: {
      [K in keyof P['contracts'] &
        string]: K extends P['contracts'][K]['commandName']
        ? IAssertContractOperationsInModels<P['contracts'][K], P['models']>
        : ITypeError<'Contract keys must match commandName'>;
    };
  },
) {
  const {
    claimsSchema,
    sessionName,
    actorName,
    actorVersion,
    models,
    systemName,
    aggregateName,
    aggregateVersion,
    contracts,
  } = props;
  for (const model of Object.values(models)) {
    assertSameCoreInstance({ value: model, expected: Model, kind: 'Model' });
  }
  for (const contract of Object.values(contracts ?? {})) {
    Schema.decodeUnknownSync(Schema.declare(isAggregateContract))(contract);
  }
  assertValidModels({ models, context: 'makeAggregateSessionDefinition' });
  if (
    aggregateName === undefined ||
    aggregateVersion === undefined ||
    contracts === undefined
  ) {
    throw new Error(
      'Aggregate sessions require aggregateName, aggregateVersion, and contracts',
    );
  }
  const decodedProps = Schema.decodeUnknownSync(AggregateSessionPropsSchema)(
    {
      sessionName,
      actorName,
      actorVersion,
      models,
      claimsSchema,
      aggregateName,
      aggregateVersion,
      contracts,
    },
    { onExcessProperty: 'error' },
  );
  assertOrdinaryContracts(
    decodedProps.contracts,
    `Aggregate session ${sessionName}`,
  );
  mapValues(decodedProps.contracts, (contract, name) => {
    if (contract.claims !== undefined) {
      assertClaimsRequirements(claimsSchema, contract.claims);
    }
    if (name !== contract.commandName) {
      throw new Error(
        `Contract key ${name} must match ${contract.commandName}`,
      );
    }
    validateContractModels({
      entry: contract,
      models,
      context: `Aggregate session ${sessionName}`,
    });
  });
  const field = claimsSchema.fields.aggregateId;
  const ast = field === undefined ? undefined : SchemaAST.toType(field.ast);
  if (
    ast === undefined ||
    ast.context?.isOptional ||
    (ast._tag !== 'String' &&
      !(ast._tag === 'Literal' && typeof ast.literal === 'string'))
  ) {
    throw new Error(
      'Aggregate session identity must contain a required string aggregateId',
    );
  }
  const { claimsSchema: _, ...definition } = decodedProps;
  const sessionDefinition: IAggregateSessionDefinition<
    P['systemName'],
    P['aggregateName'],
    P['sessionName'],
    P['contracts'],
    P['models'],
    P['aggregateVersion'],
    P['claimsSchema']
  > & {
    readonly actorName: P['actorName'];
    readonly actorVersion: P['actorVersion'];
  } = {
    ...definition,
    aggregateName,
    aggregateVersion,
    actorName,
    actorVersion,
    sessionName,
    systemName,
    claimsSchema,
    contracts: Object.freeze({ ...contracts }),
    models: Object.freeze({ ...models }),
    modelNames: Object.freeze(Object.keys(models)),
  };
  return Object.freeze(sessionDefinition);
}
