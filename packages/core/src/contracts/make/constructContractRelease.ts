import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
  type IFrameworkError,
  type IScopedError,
} from '@zerospin/error';
import {
  captureShape,
  isAttributeDescriptor,
  makeShapeCodecs,
  type IPrimitiveDescriptor,
  type IShape,
  type ITypeError,
} from '@zerospin/shapes';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { VersionSchema } from '../../declaration/VersionSchema.ts';
import { Model } from '../../models/defineModel.ts';
import { AggregateContractRelease } from '../AggregateContractRelease.ts';
import {
  DecodedAggregateCommandSchema,
  DecodedServiceCommandSchema,
  EncodedAggregateSessionSubmissionSchema,
  ServiceSessionSubmissionSchema,
} from '../CommandSchema.ts';
import { adaptPayload } from '../decodeAndAdaptPayload/adaptPayload/adaptPayload.ts';
import { defineAggregateContract } from '../defineAggregateContract.ts';
import { isAggregateExternalContractDefinition } from '../defineAggregateExternalContract.ts';
import { defineServiceContract } from '../defineServiceContract.ts';
import {
  isAggregateContractDefinition,
  isServiceContractDefinition,
  type IContractDefinition,
} from '../definition.ts';
import { evaluateContract } from '../evaluateContract.ts';
import type { IExternalContractDefinition } from '../externalContract.ts';
import { FailuresSchema, getFailuresCodec } from '../failures.ts';
import {
  isOperationDefinition,
  type IOperationDefinitions,
} from '../operationDefinition.ts';
import {
  deriveOperationsSchema,
  getOperationLeaves,
} from '../operationSchema.ts';
import {
  captureReadProjections,
  ReadProjectionSchema,
  type IReadProjection,
  type IReadProjections,
} from '../readProjection.ts';
import { resolveContractVersion } from '../resolveContractVersion.ts';
import { ServiceContractRelease } from '../ServiceContractRelease.ts';
import type {
  IAggregateContractRelease,
  IContractCallbackInput,
  IContractFailure,
  IContractProgramInput,
  IContractRelease,
  IKnownCommand,
  IPreparedInvocation,
  IServiceContractRelease,
} from '../types.ts';

export type IResultSchemaType<S> = [S] extends [never]
  ? void
  : S extends Schema.Codec<infer A, unknown>
    ? A
    : void;
export type IValidProgramOutput<P, S> =
  P extends Effect.Effect<infer A, unknown, unknown>
    ? [A] extends [IResultSchemaType<S>]
      ? unknown
      : ITypeError<'Contract program result must match its declared result codec'>
    : never;
export type IPayloadFieldDescriptor = IPrimitiveDescriptor & {
  references?: never;
  primaryKey?: false;
};

const upgradeEdges = new WeakMap<
  object,
  {
    parent: IContractRelease;
    up?: (props: { payload: unknown }) => Effect.Effect<unknown, IAnyError>;
    down?: (props: { payload: unknown }) => Effect.Effect<unknown, IAnyError>;
  }
>();
const nextVersions = new WeakMap<object, IContractRelease>();
const finalizedContracts = new WeakSet<object>();

/** System composition closes the complete runtime codec lineage against extension. */
export function finalizeContractLineage(contract: IContractRelease): void {
  const pending = [contract];
  const visited = new Set<IContractRelease>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    finalizedContracts.add(current);
    if (current.previous !== undefined) pending.push(current.previous);
    if (current.next !== undefined) pending.push(current.next);
  }
}

export function isContractFinalized(contract: IContractRelease): boolean {
  return finalizedContracts.has(contract);
}
const completedAggregateContracts = new WeakSet<object>();
const completedServiceContracts = new WeakSet<object>();

export function isAggregateContract(
  value: unknown,
): value is IAggregateContractRelease {
  return (
    value instanceof AggregateContractRelease &&
    completedAggregateContracts.has(value)
  );
}
export function isServiceContract(
  value: unknown,
): value is IServiceContractRelease {
  return (
    value instanceof ServiceContractRelease &&
    completedServiceContracts.has(value)
  );
}
export function isContract(value: unknown): value is IContractRelease {
  return isAggregateContract(value) || isServiceContract(value);
}
export function isOrdinaryContract<C extends IContractRelease>(
  value: C,
): value is C & { readonly external?: undefined } {
  return value.external === undefined;
}
export function isExternalContract<C extends IContractRelease>(
  value: C,
): value is C & { readonly external: IExternalContractDefinition } {
  return value.external !== undefined;
}

export const PayloadFieldDescriptorSchema = Schema.declare(
  (input: unknown): input is IPayloadFieldDescriptor =>
    isAttributeDescriptor(input) &&
    input.references === undefined &&
    input.primaryKey !== true,
  { expected: 'Invalid attribute descriptor' },
);
const PayloadAdapterSchema = Schema.declare(
  (
    input: unknown,
  ): input is (props: {
    payload: unknown;
  }) => Effect.Effect<unknown, IAnyError> => typeof input === 'function',
);
const ContractProgramSchema = Schema.declare(
  (
    input: unknown,
  ): input is (
    props: IContractProgramInput<IContractCallbackInput>,
  ) => Effect.Effect<unknown, IContractFailure, unknown> =>
    typeof input === 'function',
);
const GuardSchema = Schema.declare(
  (
    input: unknown,
  ): input is (
    props: IContractCallbackInput,
  ) => Effect.Effect<
    void,
    IFrameworkError | Extract<IScopedError, { scope: 'contract' }>,
    unknown
  > => typeof input === 'function',
);
const CodecSchema = Schema.declare(
  (input: unknown): input is Schema.Codec<unknown, unknown> =>
    Schema.isSchema(input),
);
const OperationsSchema = Schema.Record(
  Schema.String,
  Schema.declare(isOperationDefinition),
);
const contractCallbacks = new WeakMap<
  object,
  {
    guard: typeof GuardSchema.Type;
    program: typeof ContractProgramSchema.Type;
  }
>();
export const MakeReleasePropsSchema = Schema.Struct({
  claims: Schema.optionalKey(
    Schema.declare(
      (
        input: unknown,
      ): input is Schema.Codec<
        Readonly<Record<string, unknown>> | null,
        unknown
      > => Schema.isSchema(input),
    ),
  ),
  guard: Schema.optionalKey(GuardSchema),
  failures: Schema.optionalKey(FailuresSchema),
  models: Schema.optionalKey(Schema.Unknown),
  operations: Schema.optionalKey(OperationsSchema),
  payload: Schema.Record(Schema.String, PayloadFieldDescriptorSchema),
  version: VersionSchema,
  result: Schema.optionalKey(CodecSchema),
  program: Schema.optionalKey(ContractProgramSchema),
});

function checkModels(props: unknown) {
  if (
    typeof props !== 'object' ||
    props === null ||
    !('models' in props) ||
    typeof props.models !== 'object' ||
    props.models === null
  ) {
    return;
  }
  mapValues(props.models, (value, name) => {
    if (value === null) return;
    if (typeof value === 'object' && value !== null && 'model' in value) {
      assertSameCoreInstance({
        value: Reflect.get(value, 'model'),
        expected: Model,
        kind: 'Model',
      });
    }
    const projection = captureReadProjections({ [name]: value })[name];
    if (projection !== undefined) {
      assertSameCoreInstance({
        value: projection.model,
        expected: Model,
        kind: 'Model',
      });
    }
  });
}
function captureModels(models: unknown) {
  return captureReadProjections(models === undefined ? {} : models);
}
function validateOperationScope(
  operations: IOperationDefinitions,
  aggregate: boolean,
) {
  for (const leaf of getOperationLeaves(operations)) {
    if (leaf.operationName !== 'external') continue;
    if (leaf.family !== (aggregate ? 'aggregate' : 'service')) {
      throw new Error(
        'External operations must belong to the emitting contract family',
      );
    }
  }
}
const SessionSubmissionSchema = Schema.Struct({
  ...EncodedAggregateSessionSubmissionSchema.fields,
  payload: Schema.Unknown,
});

function makeKnownCommandSchema(contract: IContractRelease) {
  return Schema.declare<IKnownCommand>((value): value is IKnownCommand => {
    if (
      !Schema.is(DecodedAggregateCommandSchema)(value) &&
      !Schema.is(DecodedServiceCommandSchema)(value) &&
      !Schema.is(SessionSubmissionSchema)(value) &&
      !Schema.is(ServiceSessionSubmissionSchema)(value)
    ) {
      return false;
    }
    if (value.commandName !== contract.commandName) return false;
    let source: IContractRelease | undefined = contract;
    while (source !== undefined && source.version !== value.contractVersion) {
      source = source.previous;
    }
    if (
      source === undefined ||
      !Schema.is(
        Schema.toType(makeShapeCodecs(source.payload).portableCompleteCodec),
      )(value.payload)
    ) {
      return false;
    }
    if (isAggregateContract(contract) !== 'aggregateId' in value) return false;
    return source.external === undefined;
  });
}
function attachLineage(instance: object) {
  Object.defineProperties(instance, {
    previous: { get: () => upgradeEdges.get(instance)?.parent },
    next: { get: () => nextVersions.get(instance) },
    up: { get: () => upgradeEdges.get(instance)?.up },
    down: { get: () => upgradeEdges.get(instance)?.down },
  });
}

export function constructContractRelease(
  definition: IContractDefinition,
  input: unknown,
) {
  if (
    !isAggregateContractDefinition(definition) &&
    !isServiceContractDefinition(definition)
  ) {
    throw new Error('A completed concrete contract definition is required');
  }
  checkModels(input);
  const props = Schema.decodeUnknownSync(MakeReleasePropsSchema, {
    onExcessProperty: 'error',
  })(input);
  return finishContractDefinition(definition, props);
}
function finishContractDefinition(
  definition: IContractDefinition,
  props: typeof MakeReleasePropsSchema.Type,
  external?: IExternalContractDefinition,
) {
  const aggregate = isAggregateContractDefinition(definition);
  const commandName = Schema.decodeUnknownSync(Schema.NonEmptyString)(
    definition.name,
  );
  const {
    payload: inputPayload,
    models: inputModels,
    operations: inputOperations,
    failures: inputFailures,
    version,
    claims,
    result,
    guard,
    program,
  } = props;

  const payload = captureShape(inputPayload);
  const models = captureModels(inputModels);
  const operations = { ...inputOperations };
  const operationsSchema = deriveOperationsSchema(operations);
  validateOperationScope(operations, aggregate);
  const failures = { ...inputFailures };
  getFailuresCodec(failures);
  const fields = {
    commandName,
    version,
    payload,
    failures,
    models,
    operations,
    operationsSchema,
    ...(claims === undefined ? {} : { claims }),
    ...(result === undefined ? {} : { result }),
    ...(external === undefined ? {} : { external: { ...external } }),
  };
  const callbacks = {
    guard: guard ?? (() => Effect.void),
    program: program ?? (() => Effect.void),
  };
  const instance = aggregate
    ? new AggregateContractRelease()
    : new ServiceContractRelease();
  attachLineage(instance);
  (aggregate ? completedAggregateContracts : completedServiceContracts).add(
    instance,
  );
  const contract = readConstructedContract<IContractRelease>(instance);
  const evaluate = aggregate
    ? aggregateEvaluator(contract, callbacks)
    : serviceEvaluator(contract, callbacks);
  Object.assign(instance, {
    ...fields,
    evaluate,
    knownCommandSchema: makeKnownCommandSchema(contract),
  });
  contractCallbacks.set(contract, callbacks);
  (aggregate ? completedAggregateContracts : completedServiceContracts).add(
    contract,
  );
  return contract;
}

export type IPatchedModels<
  M extends IReadProjections,
  P extends Readonly<Record<string, IReadProjection | null>>,
> = [P] extends [never]
  ? M
  : Omit<M, keyof P> & {
      readonly [K in keyof P as P[K] extends null ? never : K]: Exclude<
        P[K],
        null
      >;
    };

export type IPatchedPayload<
  PAYLOAD extends IShape,
  PATCH extends Record<string, IPayloadFieldDescriptor | null>,
> = {
  readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
    ? PATCH[K] extends null
      ? never
      : K
    : K]: K extends keyof PATCH
    ? Exclude<PATCH[K], null>
    : K extends keyof PAYLOAD
      ? PAYLOAD[K]
      : never;
};

export function constructUpgradedContractRelease(
  contract: IContractRelease,
  input: unknown,
): IContractRelease {
  Schema.decodeUnknownSync(Schema.declare(isContract))(contract);
  if (finalizedContracts.has(contract)) {
    throw new Error(
      `Contract "${contract.commandName}@${contract.version}" belongs to a finalized System`,
    );
  }
  if (contract.external !== undefined) {
    throw new Error('Only ordinary contract versions may be upgraded');
  }
  checkModels(input);
  const { up, down, ...contractProps } = Schema.decodeUnknownSync(
    Schema.Struct({
      ...MakeReleasePropsSchema.fields,
      models: Schema.optionalKey(
        Schema.Record(Schema.String, Schema.NullOr(ReadProjectionSchema)),
      ),
      payload: Schema.optionalKey(
        Schema.Record(
          Schema.String,
          Schema.NullOr(PayloadFieldDescriptorSchema),
        ),
      ),
      up: Schema.optionalKey(PayloadAdapterSchema),
      down: Schema.optionalKey(PayloadAdapterSchema),
    }),
    { onExcessProperty: 'error' },
  )(input);
  const {
    payload: payloadPatch,
    models: modelPatch,
    version,
    operations: operationPatch,
    failures,
    guard,
    program,
  } = contractProps;
  const payload = { ...contract.payload };
  mapValues(payloadPatch ?? {}, (descriptor, key) => {
    if (descriptor === null) {
      if (!Object.hasOwn(payload, key)) {
        throw new Error(
          `Cannot remove unknown payload field "${key}" from ${contract.commandName}`,
        );
      }
      delete payload[key];
    } else {
      payload[key] = descriptor;
    }
  });
  const models = { ...contract.models };
  mapValues(modelPatch ?? {}, (model, key) => {
    if (model === null) {
      if (!Object.hasOwn(models, key)) {
        throw new Error(
          `Cannot remove unknown model "${key}" from ${contract.commandName}`,
        );
      }
      delete models[key];
    } else {
      models[key] = model;
    }
  });
  let ancestor: IContractRelease | undefined = contract;
  while (ancestor !== undefined) {
    if (ancestor.version === version) {
      throw new Error(`Duplicate contract version "${version}"`);
    }
    ancestor = ancestor.previous;
  }
  if (nextVersions.has(contract)) {
    throw new Error(
      `Contract "${contract.commandName}@${contract.version}" already has a next version`,
    );
  }
  const previousCallbacks = contractCallbacks.get(contract);
  if (previousCallbacks === undefined) {
    throw new Error('Missing canonical contract callbacks');
  }
  const next = readConstructedContract<IContractRelease>(
    constructContractRelease(
      isAggregateContract(contract)
        ? defineAggregateContract(contract.commandName)
        : defineServiceContract(contract.commandName),
      {
        ...(contract.claims === undefined ? {} : { claims: contract.claims }),
        ...(contract.result === undefined ? {} : { result: contract.result }),
        ...contractProps,
        models,
        payload,
        operations: { ...contract.operations, ...operationPatch },
        failures: failures ?? contract.failures,
        guard: guard ?? previousCallbacks.guard,
        program: program ?? previousCallbacks.program,
      },
    ),
  );
  upgradeEdges.set(next, {
    parent: contract,
    up:
      up ??
      (props => {
        const { payload } = props;
        return Effect.succeed(payload);
      }),
    ...(down === undefined ? {} : { down }),
  });
  nextVersions.set(contract, next);
  return readConstructedContract<IContractRelease>(next);
}

/** Preserve inferred callbacks and lineage after strict canonical construction. */
export function readConstructedContract<C>(value: unknown): C {
  return Schema.decodeUnknownSync(
    Schema.declare<C>((input): input is C => isContract(input)),
  )(value);
}
export function constructExternalContract(
  definition: IExternalContractDefinition['definition'],
  implementation: Pick<
    IExternalContractDefinition,
    'request' | 'onSuccess' | 'onFailure'
  >,
) {
  const aggregate = isAggregateExternalContractDefinition(definition);
  const continuation = Schema.Struct({
    contract: Schema.declare(
      (value: unknown): value is IContractRelease =>
        isContract(value) &&
        aggregate === isAggregateContract(value) &&
        value.external === undefined &&
        value.claims === undefined,
    ),
    payload: Schema.declare((value: unknown) => typeof value === 'function'),
  });
  Schema.decodeUnknownSync(
    Schema.Struct({
      request: Schema.declare((value: unknown) => typeof value === 'function'),
      onSuccess: continuation,
      onFailure: continuation,
    }),
    { onExcessProperty: 'error' },
  )(implementation);
  const { commandName, version, payload, response, timeoutMs } = definition;
  return finishContractDefinition(
    aggregate
      ? defineAggregateContract(commandName)
      : defineServiceContract(commandName),
    { models: {}, operations: {}, failures: {}, version, payload },
    { definition, response, timeoutMs, ...implementation },
  );
}

const isolateInvocationCodec = <A, E>(program: Effect.Effect<A, E>) =>
  program.pipe(Effect.updateContext<never, never>(() => Context.empty()));
/** Validate decoded arguments without transport version adaptation or response decoding. */
function validateEvaluationArguments(
  contract: IContractRelease,
  input: Omit<IContractCallbackInput, 'failures' | 'payload' | 'aggregateId'>,
) {
  return Effect.gen(function* () {
    const { command } = input;
    if (
      !Schema.is(DecodedAggregateCommandSchema)(command) &&
      !Schema.is(DecodedServiceCommandSchema)(command) &&
      !Schema.is(SessionSubmissionSchema)(command) &&
      !Schema.is(ServiceSessionSubmissionSchema)(command)
    ) {
      return yield* makeZerospinError('validate-command-payload-failed');
    }
    if (command.commandName !== contract.commandName) {
      return yield* makeZerospinError('contract-command-name-mismatch');
    }
    const source = resolveContractVersion(contract, command.contractVersion);
    if (source === undefined) {
      return yield* makeZerospinError('contract-payload-version-unsupported');
    }
    const adapter = source.version > contract.version ? source : contract;
    if (contract.external !== undefined) {
      return yield* makeZerospinError('external-contract-kind-mismatch');
    }
    const payload = yield* adaptPayload(adapter, {
      fromVersion: source.version,
      toVersion: contract.version,
      payload: command.payload,
    });
    const claims =
      contract.claims === undefined
        ? (input.claims ?? null)
        : yield* isolateInvocationCodec(
            Schema.decodeUnknownEffect(Schema.toType(contract.claims))(
              input.claims,
              { onExcessProperty: 'error' },
            ).pipe(
              mapParseError({
                code: 'contract-claims-invalid',
                prefix: 'Invalid contract claims',
              }),
            ),
          );
    return { command, payload, claims, db: input.db };
  });
}
function aggregateEvaluator(
  contract: IContractRelease,
  callbacks: Parameters<typeof evaluateContract>[0]['callbacks'],
) {
  return (
    input: Omit<IContractCallbackInput, 'failures' | 'payload' | 'aggregateId'>,
  ) =>
    Effect.gen(function* () {
      if (
        !('aggregateId' in input.command) ||
        typeof input.command.aggregateId !== 'string' ||
        input.command.aggregateId.length === 0
      ) {
        return yield* makeZerospinError('contract-aggregate-id-required');
      }
      const arguments_ = yield* validateEvaluationArguments(contract, input);
      return yield* evaluateContract({
        contract,
        callbacks,
        input: { ...arguments_, aggregateId: input.command.aggregateId },
      });
    });
}
function serviceEvaluator(
  contract: IContractRelease,
  callbacks: Parameters<typeof evaluateContract>[0]['callbacks'],
) {
  return (
    input: Omit<IContractCallbackInput, 'failures' | 'payload' | 'aggregateId'>,
  ) =>
    Effect.gen(function* () {
      if ('aggregateId' in input.command) {
        return yield* makeZerospinError(
          'contract-service-aggregate-id-forbidden',
        );
      }
      const arguments_ = yield* validateEvaluationArguments(contract, input);
      return yield* evaluateContract({
        contract,
        callbacks,
        input: arguments_,
      });
    });
}

/** Evaluate a framework-prepared invocation without repeating version adapters. */
export function evaluatePreparedContract(
  invocation: IPreparedInvocation,
  db: IContractCallbackInput['db'],
) {
  const { contract, ...input } = invocation;
  const callbacks = contractCallbacks.get(contract);
  if (callbacks === undefined) {
    return Effect.fail(makeZerospinError('contract-family-mismatch'));
  }
  return evaluateContract({ contract, callbacks, input: { ...input, db } });
}
