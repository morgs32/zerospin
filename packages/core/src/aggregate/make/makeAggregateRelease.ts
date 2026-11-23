import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { AggregateActorReleaseSchema } from '../../aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease.ts';
import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import '@zerospin/server-only';

import { isAggregateContract } from '../../contracts/make/constructContractRelease.ts';
import {
  isAggregateContractExtension,
  type IAggregateContractExtension,
} from '../../contracts/makeAggregateContractExtension.ts';
import { getOperationLeaves } from '../../contracts/operationSchema.ts';
import {
  OwnerGuardsSchema,
  type IOwnerGuards,
} from '../../contracts/ownerGuards.ts';
import { assertReadProjection } from '../../contracts/readProjection.ts';
import type {
  IAggregateContracts,
  IGrantedContracts,
} from '../../contracts/types.ts';
import { assembleOwnerContracts } from '../../declaration/assembleOwnerContracts.ts';
import { validateReleaseContinuations } from '../../declaration/validateReleaseContinuations.ts';
import { VersionSchema } from '../../declaration/VersionSchema.ts';
import {
  OwnerReleaseLayerSchema,
  type IOwnerActorRequirements,
  type IOwnerContractRequirements,
  type IOwnerOperationRequirements,
  type IOwnerReleaseLayerProps,
  type IRequiredOwnerServices,
} from '../../execution/ownerReleaseLayer.ts';
import { Model } from '../../models/defineModel.ts';
import { isModel } from '../../models/make/makeModelVersion.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
} from '../../models/types.ts';
import type {
  IAggregateRelease,
  IAggregateReleaseHistory,
  IAggregateReleaseIdentity,
  IAnyAggregateRelease,
} from '../types.ts';

class AggregateRelease {}

export const AggregateReleaseSchema = Schema.declare(
  (input: unknown): input is IAnyAggregateRelease =>
    input instanceof AggregateRelease,
);

const CanonicalModelSchema = Schema.declare((input: unknown): input is IModel =>
  isModel(input),
);
const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IAggregateContracts[string] =>
    isAggregateContract(input),
);

const AggregateReleasePropsSchema = Schema.Struct({
  layer: Schema.optionalKey(OwnerReleaseLayerSchema),
  contracts: Schema.optionalKey(
    Schema.Record(Schema.String, CanonicalContractSchema),
  ),
  guards: Schema.optionalKey(Schema.Record(Schema.String, OwnerGuardsSchema)),
  version: VersionSchema,
  branchFrom: Schema.optionalKey(AggregateReleaseSchema),
  rebuildFrom: Schema.optionalKey(AggregateReleaseSchema),
  models: Schema.optionalKey(
    Schema.Record(Schema.String, CanonicalModelSchema),
  ),
  system: Schema.optionalKey(
    Schema.Record(Schema.String, CanonicalContractSchema),
  ),
  external: Schema.optionalKey(
    Schema.Record(Schema.String, CanonicalContractSchema),
  ),
  extensions: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.declare(isAggregateContractExtension)),
  ),
  actors: Schema.Record(Schema.String, AggregateActorReleaseSchema),
}).check(
  Schema.makeFilter(
    props =>
      props.branchFrom === undefined ||
      props.rebuildFrom === undefined ||
      'An Aggregate release can only name one predecessor',
  ),
);

export function makeAggregateRelease<
  const NAME extends string,
  const MODELS extends IAnyModels = {},
  const SYSTEM extends IAggregateContracts = {},
  const EXTERNAL extends IAggregateContracts = {},
  const ACTORS extends IAnyAggregateRelease['actors'] = {},
  const VERSION extends number = number,
  GUARD_REQUIREMENTS = never,
  const CONTRACTS extends IAggregateContracts = {},
  const EXTENSIONS extends Readonly<
    Record<string, IAggregateContractExtension>
  > = {},
  const BRANCH extends IAnyAggregateRelease &
    IAggregateReleaseIdentity<NoInfer<NAME>> = never,
  const REBUILD extends IAnyAggregateRelease &
    IAggregateReleaseIdentity<NoInfer<NAME>> = never,
>(
  identity: Readonly<{ name: NAME }>,
  props: {
    version: VERSION;
    contracts?: CONTRACTS;
    models?: MODELS & IAssertValidModels<NoInfer<MODELS>>;
    system?: SYSTEM;
    external?: EXTERNAL;
    extensions?: EXTENSIONS & {
      [K in keyof EXTENSIONS]: { source: { commandName: K } };
    };
    guards?: {
      readonly [K in keyof NoInfer<ACTORS>]?: IOwnerGuards<
        NoInfer<ACTORS[K]['contracts']>,
        NoInfer<MODELS>,
        NoInfer<ACTORS[K]['identity']['claimsSchema']['Type']>,
        'aggregate',
        GUARD_REQUIREMENTS
      >;
    };
    actors: ACTORS & {
      [K in keyof ACTORS]: {
        name: K;
        capturedSelections: {
          [M in keyof ACTORS[K]['capturedSelections']]: {
            model: M extends keyof MODELS ? MODELS[M] : never;
          };
        };
      };
    };
  } & IAggregateReleaseHistory<BRANCH, REBUILD> &
    IOwnerReleaseLayerProps<
      | IRequiredOwnerServices<NoInfer<GUARD_REQUIREMENTS>>
      | IRequiredOwnerServices<
          Effect.Services<
            ReturnType<NoInfer<EXTENSIONS>[keyof EXTENSIONS]['evaluate']>
          >
        >
      | IOwnerOperationRequirements<
          NoInfer<EXTENSIONS>[keyof EXTENSIONS]['operations']
        >
      | IOwnerContractRequirements<NoInfer<SYSTEM>>
      | IOwnerContractRequirements<NoInfer<EXTERNAL>>
      | IOwnerContractRequirements<NoInfer<CONTRACTS>>
      | IOwnerActorRequirements<NoInfer<ACTORS>>
    >,
): IAggregateRelease<
  NAME,
  MODELS,
  ACTORS,
  VERSION,
  GUARD_REQUIREMENTS,
  IGrantedContracts<
    SYSTEM | EXTERNAL | ACTORS[keyof ACTORS]['contracts'] | CONTRACTS
  >,
  SYSTEM,
  EXTERNAL,
  IAggregateReleaseHistory<NoInfer<BRANCH>, NoInfer<REBUILD>>
>;

export function makeAggregateRelease(
  identity: Readonly<{
    name: string;
  }>,
  props: unknown,
): unknown {
  if (typeof props === 'object' && props !== null) {
    const models = 'models' in props ? props.models : undefined;
    if (typeof models === 'object' && models !== null) {
      mapValues(models, value =>
        assertSameCoreInstance({ value, expected: Model, kind: 'Model' }),
      );
    }
  }
  const decodedProps = Schema.decodeUnknownSync(AggregateReleasePropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const decodedRelease = {
    ...decodedProps,
    ...Schema.decodeUnknownSync(
      Schema.Struct({
        name: Schema.NonEmptyString,
      }),
      { onExcessProperty: 'error' },
    )(identity),
  };
  const {
    name,
    version,
    layer,
    branchFrom,
    rebuildFrom,
    actors,
    contracts: declaredContracts = {},
    system = {},
    external = {},
    extensions = {},
  } = decodedRelease;
  const models = { ...decodedRelease.models };
  const contracts = assembleOwnerContracts({
    actors,
    declaredContracts,
    system,
    external,
  });
  mapValues(extensions, (extension, commandName) => {
    if (
      commandName !== extension.source.commandName ||
      contracts[commandName] !== extension.source
    ) {
      throw new Error(
        `Extension ${commandName} must bind the owner's exact source contract`,
      );
    }
    const projectedModels = new Set(Object.keys(extension.models));
    mapValues(extension.models, (projection, modelName) =>
      assertReadProjection({
        projection,
        projectedModels,
        model: models[modelName],
        context: `Extension ${commandName}`,
      }),
    );
    for (const operation of getOperationLeaves(extension.operations)) {
      if (
        'model' in operation &&
        models[operation.model.modelName] !== operation.model
      ) {
        throw new Error(
          `Extension operation model ${operation.model.modelName} must belong to its aggregate release`,
        );
      }
      if (
        'family' in operation &&
        !('destination' in operation) &&
        operation.family !== 'aggregate'
      ) {
        throw new Error(
          'External operations must belong to the Aggregate contract family',
        );
      }
    }
  });
  const systemGrants: IAggregateContracts = Object.assign(
    Object.create(null),
    system,
  );
  const externalGrants: IAggregateContracts = Object.assign(
    Object.create(null),
    external,
  );
  const fields = {
    guards: mapValues(decodedRelease.guards ?? {}, guards => ({ ...guards })),
    definition: identity,
    name,
    version,
    ...(layer === undefined ? {} : { layer }),
    ...(branchFrom === undefined ? {} : { branchFrom }),
    ...(rebuildFrom === undefined ? {} : { rebuildFrom }),
    models,
    contracts,
    system: systemGrants,
    external: externalGrants,
    extensions: { ...extensions },
    actors: { ...actors },
  };
  validateReleaseContinuations(fields, declaredContracts);
  const aggregateRelease = Object.assign(new AggregateRelease(), fields);
  return aggregateRelease;
}
