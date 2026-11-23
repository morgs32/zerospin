import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { isServiceContract } from '../../contracts/make/constructContractRelease.ts';
import {
  isServiceContractExtension,
  type IServiceContractExtension,
} from '../../contracts/makeServiceContractExtension.ts';
import type {
  IGrantedContracts,
  IServiceContracts,
} from '../../contracts/types.ts';
import '@zerospin/server-only';

import { assembleOwnerContracts } from '../../declaration/assembleOwnerContracts.ts';
import { validateContractExtensions } from '../../declaration/validateContractExtensions.ts';
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
import type { IAnyModels, IModel } from '../../models/types.ts';
import { ServiceActorReleaseSchema } from '../../serviceActor/make/makeServiceActorRelease.ts';
import type { IAnyServiceActorRelease } from '../../serviceActor/types.ts';
import type { IAnyServiceRelease, IServiceRelease } from '../types.ts';
const CanonicalModelSchema = Schema.declare((input: unknown): input is IModel =>
  isModel(input),
);
const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IServiceContracts[string] =>
    isServiceContract(input),
);
const ServiceReleasePropsSchema = Schema.Struct({
  layer: Schema.optionalKey(OwnerReleaseLayerSchema),
  contracts: Schema.optionalKey(
    Schema.Record(Schema.String, CanonicalContractSchema),
  ),
  version: VersionSchema,
  models: Schema.Record(Schema.String, CanonicalModelSchema),
  system: Schema.optionalKey(
    Schema.Record(Schema.String, CanonicalContractSchema),
  ),
  external: Schema.optionalKey(
    Schema.Record(Schema.String, CanonicalContractSchema),
  ),
  extensions: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.declare(isServiceContractExtension)),
  ),
  actors: Schema.optionalKey(
    Schema.Record(Schema.String, ServiceActorReleaseSchema),
  ),
});
class ServiceRelease {}
export const ServiceReleaseSchema = Schema.declare(
  (input: unknown): input is IAnyServiceRelease =>
    input instanceof ServiceRelease,
);
/** Construct one complete service release from canonical declarations. */
export function makeServiceRelease<
  const NAME extends string,
  const MODELS extends IAnyModels,
  const SYSTEM extends IServiceContracts = {},
  const EXTERNAL extends IServiceContracts = {},
  const ACTORS extends Readonly<Record<string, IAnyServiceActorRelease>> = {},
  const VERSION extends number = number,
  const CONTRACTS extends IServiceContracts = {},
  const EXTENSIONS extends Readonly<Record<string, IServiceContractExtension>> =
    {},
>(
  definition: Readonly<{
    name: NAME;
  }>,
  props: {
    version: VERSION;
    contracts?: CONTRACTS;
    models: MODELS;
    system?: SYSTEM;
    external?: EXTERNAL;
    extensions?: EXTENSIONS & {
      [K in keyof EXTENSIONS]: { source: { commandName: K } };
    };
    actors?: ACTORS & {
      [K in keyof ACTORS]: {
        name: K;
      };
    };
  } & IOwnerReleaseLayerProps<
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
): IServiceRelease<
  NAME,
  MODELS,
  IGrantedContracts<
    SYSTEM | EXTERNAL | ACTORS[keyof ACTORS]['contracts'] | CONTRACTS
  >,
  ACTORS,
  VERSION,
  SYSTEM,
  EXTERNAL
>;
export function makeServiceRelease(
  definition: Readonly<{
    name: string;
  }>,
  props: unknown,
): unknown {
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.NonEmptyString }), {
    onExcessProperty: 'error',
  })(definition);
  if (typeof props === 'object' && props !== null) {
    const models = 'models' in props ? props.models : undefined;
    if (typeof models === 'object' && models !== null) {
      mapValues(models, value =>
        assertSameCoreInstance({ value, expected: Model, kind: 'Model' }),
      );
    }
  }
  const decodedProps = Schema.decodeUnknownSync(ServiceReleasePropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const {
    version,
    layer,
    models,
    system = {},
    external = {},
    extensions = {},
    actors = {},
    contracts: declaredContracts = {},
  } = decodedProps;
  const contracts = assembleOwnerContracts({
    actors,
    declaredContracts,
    system,
    external,
  });
  validateContractExtensions(extensions, contracts, models);
  const { name } = definition;
  const systemGrants: IServiceContracts = Object.assign(
    Object.create(null),
    system,
  );
  const externalGrants: IServiceContracts = Object.assign(
    Object.create(null),
    external,
  );
  const fields = {
    extensions: { ...extensions },
    actors: { ...actors },
    definition,
    name,
    version,
    ...(layer === undefined ? {} : { layer }),
    models: { ...models },
    contracts,
    system: systemGrants,
    external: externalGrants,
  };
  validateReleaseContinuations(fields, declaredContracts);
  return Object.assign(new ServiceRelease(), fields);
}
