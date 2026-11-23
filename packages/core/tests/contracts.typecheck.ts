import { expectTypeOf } from '@effect/vitest';
import { RoutePattern } from '@remix-run/route-pattern';
/** Compile only: accepted example calls and intentional misuse never execute. */
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import type { IAggregateActorAuthorization } from '@zerospin/core/aggregateActor/types';
import { type stageAggregateSessionCommand } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand';
import type {
  IAggregateCommandSession,
  IAggregateSession,
} from '@zerospin/core/aggregateSession/types';
import type { ICommandOutcome } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { ActorCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineAggregateExternalContract } from '@zerospin/core/contracts/defineAggregateExternalContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import type { IInferContractCommands } from '@zerospin/core/contracts/InferCommands';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeAggregateExternalContractRelease } from '@zerospin/core/contracts/make/makeAggregateExternalContractRelease';
import type { IContractReadDb } from '@zerospin/core/contracts/make/makeContractReadDb';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeServiceExternalContractRelease } from '@zerospin/core/contracts/make/makeServiceExternalContractRelease';
import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import type {
  IAggregateCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { upgradeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { modelId } from '@zerospin/core/models/modelId';
import type { IInferCommandPayload } from '@zerospin/core/models/types';
import { defineService } from '@zerospin/core/service/defineService';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { makeServiceActorRelease } from '@zerospin/core/serviceActor/make/makeServiceActorRelease';
import { updateServiceActorRelease } from '@zerospin/core/serviceActor/updateServiceActorRelease';
import { type stageServiceSessionCommand } from '@zerospin/core/serviceSession/stageServiceSessionCommand';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import type { IServiceSessionReplayRequirements } from '@zerospin/core/sessionExecution/requirements';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import type { ISystemApi } from '@zerospin/core/systemApi/ISystemApi';
import type { ISystemHarnessApi } from '@zerospin/core/testing/systemHarness/types';
import type { IApiFailure } from '@zerospin/core/utils/getApi/getApi';
import type { getSystemApi } from '@zerospin/core/utils/getSystemApi/getSystemApi';
import { primitives } from '@zerospin/shapes';
import type { getNativeSystemApi } from '@zerospin/system-worker/getNativeSystemApi';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

import { userAggregateReleaseV1 } from '../../../examples/shopping/src/zerospin/aggregates/user/userAggregateReleaseV1.ts';
import { type catalogSessionDefinition } from '../../../examples/shopping/src/zerospin/catalogSessionDefinition.ts';
import { type promotionSessionDefinition } from '../../../examples/shopping/src/zerospin/promotionSessionDefinition.ts';
import {
  applyComputerMove,
  playExternalOMove,
} from '../../../examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts';
import { aggregateRelease } from '../../../examples/tic-tac-toe/src/gameAggregateReleaseV1.ts';

import { ReceiptDelivery } from './fixtures/receipts/ReceiptDelivery.ts';
import { receiptsServiceReleaseV1 } from './fixtures/receipts/receiptsServiceReleaseV1.ts';
import {
  recordReceiptDelivery,
  sendExternalReceiptV1,
} from './fixtures/receipts/sendExternalReceiptV1.ts';

class ReleasePolicy extends Context.Service<ReleasePolicy, boolean>()(
  'ReleasePolicy',
) {}

export function ownerReleaseLayerExamples() {
  const publish = makeAggregateContractRelease(
    defineAggregateContract('publish'),
    {
      version: 1,
      payload: {},
      guard: Effect.fn(function* () {
        yield* ReleasePolicy;
      }),
    },
  );
  const aggregate = defineAggregate({ name: 'publication' });
  const aggregateRelease = { version: 1, actors: {}, system: { publish } };
  // @ts-expect-error The release must provide its command guard's service.
  makeAggregateRelease(aggregate, aggregateRelease);
  makeAggregateRelease(aggregate, {
    ...aggregateRelease,
    layer: Layer.succeed(ReleasePolicy, true),
  });

  const receipts = defineService({ name: 'receipts' });
  const serviceRelease = {
    version: 1,
    models: {},
    contracts: { recordReceiptDelivery },
    external: { sendExternalReceipt: sendExternalReceiptV1 },
  };
  // @ts-expect-error The release must provide its external request service.
  makeServiceRelease(receipts, serviceRelease);
  makeServiceRelease(receipts, {
    ...serviceRelease,
    layer: Layer.succeed(ReceiptDelivery, () =>
      Effect.succeed({ reference: 'receipt' }),
    ),
  });
}

export function inheritedServiceActorGuardExamples() {
  const read = makeServiceContractRelease(defineServiceContract('read'), {
    version: 1,
    payload: { key: primitives.text() },
  });
  const actor = makeServiceActorRelease(
    { name: 'reader' },
    {
      version: 1,
      db: makeQueryDbVersion({ models: {} }),
      exposedModels: {},
      identity: makeActorIdentity({
        claims: Schema.Struct({}),
        actorPath: RoutePattern.parse('/reader'),
      }),
      authentication: 'none',
      contracts: { read },
      selections: {},
      guards: {
        read: Effect.fn(function* ({ payload }) {
          expectTypeOf(payload.key).toEqualTypeOf<string>();
          yield* ReleasePolicy;
        }),
      },
    },
  );
  const reader = updateServiceActorRelease(actor, {
    version: 2,
    authorize: () => Effect.void,
  });
  const service = defineService({ name: 'library' });
  const releaseProps = { version: 2, models: {}, actors: { reader } };
  // @ts-expect-error An inherited guard still needs its service on the release Layer.
  makeServiceRelease(service, releaseProps);
  makeServiceRelease(service, {
    ...releaseProps,
    layer: Layer.succeed(ReleasePolicy, true),
  });

  const replaced = updateServiceActorRelease(reader, {
    version: 3,
    guards: { read: () => Effect.void },
  });
  makeServiceRelease(service, {
    version: 3,
    models: {},
    actors: { reader: replaced },
  });
}

export function projectedContractReadExamples() {
  const game = aggregateRelease.models.game;
  const readFullGame = (db: IContractReadDb<{ game: typeof game }>) =>
    findFirst({ db, model: db.models.game });
  const nextGame = upgradeModelVersion(game, {
    version: 2,
    attributes: { extra: primitives.text() },
  });
  const readEitherGame = (
    db: Omit<IContractReadDb<{ game: typeof game }>, 'models'> & {
      models: {
        game: Pick<typeof game | typeof nextGame, 'modelName' | 'table'>;
      };
    },
  ) =>
    findFirst({
      db,
      model: db.models.game,
      where: { id: { eq: 'gam_one' } },
    });
  expectTypeOf(readEitherGame).toBeFunction();
  makeAggregateContractRelease(defineAggregateContract('fullGameHelper'), {
    version: 1,
    payload: {},
    models: {
      game: {
        model: game,
        fields: ['createdAt', 'updatedAt', 'board', 'computerMoveFailure'],
      },
    },
    guard: ({ db }) => readFullGame(db).pipe(Effect.asVoid),
  });
  makeAggregateContractRelease(defineAggregateContract('projectedGame'), {
    version: 1,
    payload: {},
    models: { game: { model: game, fields: ['board'] } },
    guard: Effect.fn(function* ({ db }) {
      // @ts-expect-error The helper requires fields this contract did not project.
      yield* readFullGame(db);
      const row = yield* findFirst({ db, model: db.models.game });
      if (row !== undefined) {
        expectTypeOf(row.board).toEqualTypeOf<string>();
        // @ts-expect-error Undeclared fields are not returned by projected reads.
        void row.computerMoveFailure;
      }
      yield* findFirst({
        db,
        model: db.models.game,
        // @ts-expect-error Filters cannot use an undeclared field.
        where: { computerMoveFailure: { isNull: true } },
      });
    }),
  });
  makeAggregateContractRelease(defineAggregateContract('invalidProjection'), {
    version: 1,
    payload: {},
    // @ts-expect-error Projection fields must exist on the source model.
    models: { game: { model: game, fields: ['missing'] } },
  });
}

/** Admission supplies owner scope and system provenance, never an external outcome. */
export function admissionCommandInputExamples({
  executeCommand,
}: Parameters<IAggregateActorAuthorization>[0]) {
  executeCommand({
    commandName: 'ensureUser',
    contractVersion: 1,
    payload: { userId: 'user_one' },
  });
  executeCommand({
    // @ts-expect-error The direct System path allocates the command identity.
    id: 'cmd_provision',
    commandName: 'ensureUser',
    contractVersion: 1,
    payload: { userId: 'user_one' },
  });
  executeCommand({
    commandName: 'ensureUser',
    contractVersion: 1,
    payload: { userId: 'user_one' },
    // @ts-expect-error Ordinary commands cannot carry provider observations.
    externalOutcome: null,
  });
}

/** Authored execution APIs return only the retained original outcome. */
export function directExecutionOutcomeExamples(
  aggregateOutcome: Effect.Success<
    ReturnType<ISystemApi['executeAggregateCommand']>
  >,
  serviceOutcome: Effect.Success<
    ReturnType<ISystemApi['executeServiceCommand']>
  >,
  authorizationOutcome: Effect.Success<
    ReturnType<Parameters<IAggregateActorAuthorization>[0]['executeCommand']>
  >,
) {
  expectTypeOf(aggregateOutcome).toEqualTypeOf<ICommandOutcome>();
  expectTypeOf(serviceOutcome).toEqualTypeOf<ICommandOutcome>();
  expectTypeOf(authorizationOutcome).toEqualTypeOf<ICommandOutcome>();
  // @ts-expect-error Execution returns an outcome without an echoed command receipt.
  void aggregateOutcome.outcome;
  // @ts-expect-error Service execution returns the outcome directly.
  void serviceOutcome.outcome;
  // @ts-expect-error Authorization execution also returns the outcome directly.
  void authorizationOutcome.outcome;
}

export function acceptedExternalContractExamples() {
  aggregateRelease.contracts.playExternalOMove.external.definition.externalOperation.make(
    {
      payload: { id: 'gam_one', board: 'X........' },
    },
  );
  userAggregateReleaseV1.contracts.getExternalPurchaseQuote.external.definition.externalOperation.make(
    {
      payload: {
        snapshot: { cartId: 'crt_one', purchaseId: 'pur_one', items: [] },
      },
    },
  );
  receiptsServiceReleaseV1.contracts.sendExternalReceipt.external.definition.externalOperation.make(
    {
      payload: { receiptId: 'rcp_one', recipient: 'reader@example.com' },
    },
  );

  const nextDefinition = defineAggregateExternalContract({
    name: 'playExternalOMove',
    version: 2,
    payload: { ...playExternalOMove.payload, reason: primitives.text() },
    response: Schema.Struct({ square: Schema.Int }),
  });
  const next = makeAggregateExternalContractRelease(nextDefinition, {
    request: ({ payload }) => {
      expectTypeOf(payload.reason).toEqualTypeOf<string>();
      return Effect.succeed({ square: 4 });
    },
    onSuccess: {
      contract: applyComputerMove,
      payload: Effect.fn(function* (input) {
        expectTypeOf<keyof typeof input>().toEqualTypeOf<
          'payload' | 'response'
        >();
        expectTypeOf(input.response.square).toEqualTypeOf<number>();
        return {
          id: input.payload.id,
          board: input.payload.board,
          square: input.response.square,
          requestFailure: null,
        };
      }),
    },
    onFailure: {
      contract: applyComputerMove,
      payload: Effect.fn(function* (input) {
        expectTypeOf<keyof typeof input>().toEqualTypeOf<
          'payload' | 'failure'
        >();
        expectTypeOf(
          input.failure.code,
        ).toEqualTypeOf<'external-request-failed'>();
        return {
          id: input.payload.id,
          board: input.payload.board,
          square: null,
          requestFailure: input.failure.message,
        };
      }),
    },
  });
  expectTypeOf(next.external.definition).toEqualTypeOf<typeof nextDefinition>();
  expectTypeOf<
    Effect.Success<ReturnType<typeof next.external.request>>
  >().toEqualTypeOf<{ readonly square: number }>();
}

export function rejectedExternalContractExamples() {
  makeAggregateExternalContractRelease(playExternalOMove.external.definition, {
    // @ts-expect-error External implementations cannot declare Actor claims.
    claims: Schema.Struct({ userId: Schema.String }),
    request: () => Effect.succeed(4),
    onSuccess: playExternalOMove.external.onSuccess,
    onFailure: playExternalOMove.external.onFailure,
  });
  makeServiceExternalContractRelease(
    sendExternalReceiptV1.external.definition,
    {
      request: () => Effect.succeed({ reference: 'mail_one' }),
      onSuccess: {
        contract: recordReceiptDelivery,
        // @ts-expect-error A builder must return the continuation contract's declared payload.
        payload: () => Effect.succeed({ receiptId: 'rcp_one' }),
      },
      onFailure: sendExternalReceiptV1.external.onFailure,
    },
  );
  playExternalOMove.external.definition.externalOperation.make({
    // @ts-expect-error A computer move requires its declared board payload.
    payload: { id: 'gam_one', square: 4 },
  });
  playExternalOMove.external.definition.externalOperation.make({
    payload: { id: 'gam_one', board: 'X........' },
    // @ts-expect-error A move cannot choose another aggregate instance for external execution.
    aggregateId: 'game_other',
  });
  sendExternalReceiptV1.external.definition.externalOperation.make({
    payload: { receiptId: 'rcp_one', recipient: 'reader@example.com' },
    // @ts-expect-error Receipt delivery cannot choose another service for external execution.
    serviceName: 'otherReceipts',
  });
  makeAggregateContractRelease(
    defineAggregateContract('wrongAggregateExternal'),
    {
      version: 1,
      payload: {},
      operations: {
        // @ts-expect-error An aggregate program cannot record a service external operation.
        sendReceipt:
          sendExternalReceiptV1.external.definition.externalOperation,
      },
    },
  );
  makeServiceContractRelease(defineServiceContract('wrongServiceExternal'), {
    version: 1,
    payload: {},
    operations: {
      // @ts-expect-error A service program cannot record an aggregate external operation.
      playO: playExternalOMove.external.definition.externalOperation,
    },
  });
  makeAggregateContractRelease(
    defineAggregateContract('publicPlayWithExternalMove'),
    {
      version: 1,
      payload: {},
      operations: {
        playO: playExternalOMove.external.definition.externalOperation,
      },
    },
  );
}

/** Numeric declarations retain their literal identities through registry composition. */
export function integerVersionExamples() {
  const contract = makeAggregateContractRelease(
    defineAggregateContract('integerRevision'),
    { version: 2, payload: {} },
  );
  const contractVersion: 2 = contract.version;
  const system = makeSystem({
    name: 'integer-revisions',
    aggregates: {
      user: { releases: { 1: userAggregateReleaseV1 } },
    },
  });
  const aggregateVersion: 1 = system.aggregates.user.releases[1].version;
  makeSystem({
    name: 'unsupported-aggregate-canonical',
    aggregates: {
      user: {
        releases: { 1: userAggregateReleaseV1 },
        // @ts-expect-error Aggregate registries contain only releases.
        canonical: 1,
      },
    },
  });
  makeSystem({
    name: 'unregistered-service-canonical',
    aggregates: {},
    services: {
      receipts: {
        // @ts-expect-error This release map has no canonical key 2.
        releases: { 1: receiptsServiceReleaseV1 },
        // @ts-expect-error Service canonical must also be a registered key.
        canonical: 2,
      },
    },
  });
  makeAggregateContractRelease(defineAggregateContract('stringRevision'), {
    // @ts-expect-error Authored revisions are numbers.
    version: '1',
    payload: {},
  });
  makeSystem({
    name: 'mismatched-revisions',
    aggregates: {
      user: {
        releases: {
          // @ts-expect-error A registry key must equal its declaration's integer revision.
          2: userAggregateReleaseV1,
        },
      },
    },
  });
  makeSystem({
    name: 'quoted-revisions',
    aggregates: {
      user: {
        releases: {
          // @ts-expect-error Authored registry keys use numeric literals.
          '1': userAggregateReleaseV1,
        },
      },
    },
  });
  return { contractVersion, aggregateVersion };
}

/** Administrative reads retain local selected types; named query authoring is gone. */
export function typedServiceReadExamples(api: ISystemApi) {
  expectTypeOf<
    Effect.Success<ReturnType<typeof getSystemApi>>
  >().toEqualTypeOf<ISystemApi>();
  expectTypeOf<
    ReturnType<typeof getNativeSystemApi>
  >().toEqualTypeOf<ISystemApi>();
  expectTypeOf<ISystemHarnessApi>().toEqualTypeOf<
    Pick<ISystemApi, 'executeServiceCommand' | 'executeServiceQuery'>
  >();
  const db = makeQueryDbVersion({ models: receiptsServiceReleaseV1.models });
  const selected = api.executeServiceQuery({
    serviceName: 'receipts',
    serviceVersion: 1,
    query: db.query.receipt.findFirst({
      columns: { id: true, createdAt: true },
    }),
  });
  expectTypeOf<Effect.Success<typeof selected>>().toEqualTypeOf<
    { id: `rcp_${string}`; createdAt: Date } | undefined
  >();
  expectTypeOf<Effect.Error<typeof selected>>().toEqualTypeOf<IApiFailure>();
  expectTypeOf<Effect.Services<typeof selected>>().toEqualTypeOf<never>();
  const gameDb = makeQueryDbVersion({ models: aggregateRelease.models });
  const selectedGame = api.executeAggregateQuery({
    aggregateName: 'game',
    aggregateVersion: 1,
    aggregateId: 'game_one',
    query: gameDb.query.game.findFirst({ columns: { board: true } }),
  });
  expectTypeOf<Effect.Success<typeof selectedGame>>().toEqualTypeOf<
    { board: string } | undefined
  >();
  expectTypeOf<
    Effect.Error<typeof selectedGame>
  >().toEqualTypeOf<IApiFailure>();
  expectTypeOf<Effect.Services<typeof selectedGame>>().toEqualTypeOf<never>();
  api.executeServiceQuery({
    serviceName: 'receipts',
    serviceVersion: 1,
    // @ts-expect-error Administrative reads accept a typed selection, not a named callback.
    queryName: 'legacy',
    params: {},
  });
  makeServiceRelease(
    { name: 'legacyReads' },
    {
      version: 1,
      models: {},
      system: {},
      // @ts-expect-error Service releases no longer declare named query callbacks.
      queries: {},
    },
  );
}

/** Model metadata belongs to complete envelopes, not root or related SQL rows. */
export function storedModelQueryExamples(
  db: IContractReadDb<typeof userAggregateReleaseV1.models>,
) {
  const cart = userAggregateReleaseV1.models.cart;
  findFirst({
    db,
    model: cart,
    columns: { id: true },
    where: { items: { quantity: { gt: 0 } } },
    with: { items: { columns: { id: true, quantity: true } } },
  });
  // @ts-expect-error Model names are not stored query columns.
  findFirst({ db, model: cart, columns: { modelName: true } });
  // @ts-expect-error Model versions are not stored filter fields.
  findFirst({ db, model: cart, where: { version: { eq: 1 } } });
  // @ts-expect-error Model identity cannot order stored rows.
  findFirst({ db, model: cart, orderBy: { modelName: 'asc' } });
  findFirst({
    db,
    model: cart,
    with: {
      items: {
        // @ts-expect-error Related rows also omit model versions.
        columns: { version: true },
      },
    },
  });
  findFirst({
    db,
    model: cart,
    where: {
      items: {
        // @ts-expect-error Related filters cannot name resource-envelope metadata.
        modelName: { eq: 'cartItem' },
      },
    },
  });
  findFirst({
    db,
    model: cart,
    with: {
      items: {
        // @ts-expect-error Related ordering also uses stored columns only.
        orderBy: { version: 'desc' },
      },
    },
  });

  const queryDb = makeQueryDbVersion({ models: userAggregateReleaseV1.models });
  queryDb.query.cart.findMany({
    columns: { id: true },
    with: { items: { columns: { id: true }, orderBy: { quantity: 'desc' } } },
  });
  queryDb.query.cart.findMany({
    // @ts-expect-error Portable authored reads do not expose model metadata columns.
    columns: { modelName: true },
  });
  queryDb.query.cart.findMany({
    // @ts-expect-error Portable authored filters also use physical model fields.
    where: { version: { eq: 1 } },
  });
  queryDb.query.cart.findMany({
    // @ts-expect-error Portable authored ordering excludes model identity.
    orderBy: { modelName: 'asc' },
  });
  queryDb.query.cart.findMany({
    with: {
      items: {
        // @ts-expect-error Portable related rows have no version column.
        columns: { version: true },
      },
    },
  });
  queryDb.query.cart.findMany({
    where: {
      items: {
        // @ts-expect-error Portable related filters exclude model identity.
        modelName: { eq: 'cartItem' },
      },
    },
  });
  queryDb.query.cart.findMany({
    with: {
      items: {
        // @ts-expect-error Portable related ordering also excludes metadata.
        orderBy: { version: 'desc' },
      },
    },
  });
}

/** The selected System grant owns command names and payload inference. */
export function systemGrantExecutionExamples(api: ISystemApi) {
  expectTypeOf<
    keyof typeof catalogSessionDefinition.contracts
  >().toEqualTypeOf<never>();
  expectTypeOf<
    keyof typeof promotionSessionDefinition.contracts
  >().toEqualTypeOf<never>();
  expectTypeOf<
    IServiceSessionReplayRequirements<typeof catalogSessionDefinition>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    IServiceSessionReplayRequirements<typeof promotionSessionDefinition>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    keyof typeof receiptsServiceReleaseV1.system
  >().toEqualTypeOf<'requestReceipt'>();
  expectTypeOf<
    keyof typeof receiptsServiceReleaseV1.external
  >().toEqualTypeOf<'sendExternalReceipt'>();
  expectTypeOf<keyof typeof receiptsServiceReleaseV1.contracts>().toEqualTypeOf<
    'requestReceipt' | 'sendExternalReceipt' | 'recordReceiptDelivery'
  >();
  api.executeServiceCommand(receiptsServiceReleaseV1, {
    contractName: 'requestReceipt',
    payload: { receiptId: 'rcp_one', recipient: 'reader@example.com' },
  });
  api.executeServiceCommand(receiptsServiceReleaseV1, {
    // @ts-expect-error Direct System IDs are allocated inside ServiceChain.
    id: 'cmd_caller',
    contractName: 'requestReceipt',
    payload: { receiptId: 'rcp_one', recipient: 'reader@example.com' },
  });
  api.executeServiceCommand(receiptsServiceReleaseV1, {
    contractName: 'requestReceipt',
    // @ts-expect-error Payload is inferred from the selected System grant.
    payload: { receiptId: 'rcp_one', recipient: 123 },
  });
  api.executeServiceCommand(receiptsServiceReleaseV1, {
    // @ts-expect-error External registration never grants administrative execution.
    contractName: 'sendExternalReceipt',
    payload: { receiptId: 'rcp_one', recipient: 'reader@example.com' },
  });
  const cartInput = {
    aggregateId: 'usr_one',
    contractName: 'addToCart',
    payload: {
      newCartId: 'crt_one',
      newCartItemId: 'cit_one',
      product: { id: 'prd_one', name: 'Coffee Mug', price: 1400 },
      quantity: 1,
    },
  } as const;
  api.executeAggregateCommand(userAggregateReleaseV1, cartInput);
  api.executeAggregateCommand(userAggregateReleaseV1, {
    ...cartInput,
    // @ts-expect-error An Actor grant alone does not grant System execution.
    contractName: 'removeFromCart',
  });
  api.executeAggregateCommand(userAggregateReleaseV1, {
    ...cartInput,
    // @ts-expect-error An Agent grant alone does not grant System execution.
    contractName: 'createTrackingLabel',
  });
  // @ts-expect-error Completed grant maps are readonly.
  receiptsServiceReleaseV1.system.requestReceipt =
    receiptsServiceReleaseV1.contracts.requestReceipt;
}

/** Ordinary programs record async descriptions with family-safe complete payloads. */
export function commandOperationExamples() {
  const aggregate = defineAggregate({ name: 'commandDestination' });
  const service = defineService({ name: 'commandDestination' });
  const aggregateContract = makeAggregateContractRelease(
    defineAggregateContract('aggregateChild'),
    {
      version: 1,
      payload: { value: primitives.text() },
    },
  );
  const serviceContract = makeServiceContractRelease(
    defineServiceContract('serviceChild'),
    {
      version: 1,
      payload: { value: primitives.text() },
      result: Schema.NumberFromString,
      program: () => Effect.succeed(1),
    },
  );
  const aggregateCommand = makeCommandOperation({
    destination: { aggregate, version: 1 },
    contract: aggregateContract,
  });
  const serviceCommand = makeCommandOperation({
    destination: { service, version: 1 },
    contract: serviceContract,
    onSuccess: {
      contract: aggregateContract,
      payload: Effect.fn('commandOperationExamples.onSuccess')(input => {
        expectTypeOf<keyof typeof input>().toEqualTypeOf<
          'payload' | 'success'
        >();
        expectTypeOf(input.success).toEqualTypeOf<number>();
        return Effect.succeed({ value: input.payload.value + input.success });
      }),
    },
    onFailure: {
      contract: aggregateContract,
      payload: Effect.fn('commandOperationExamples.onFailure')(input => {
        expectTypeOf<keyof typeof input>().toEqualTypeOf<
          'payload' | 'failure'
        >();
        return Effect.succeed({
          value: input.payload.value + input.failure.code,
        });
      }),
    },
  });
  aggregateCommand.make({
    aggregateId: 'instance',
    payload: { value: 'complete' },
  });
  serviceCommand.make({ payload: { value: 'complete' } });
  // @ts-expect-error Aggregate command descriptions require an aggregate instance ID.
  aggregateCommand.make({ payload: { value: 'complete' } });
  serviceCommand.make({
    // @ts-expect-error Service command descriptions cannot name an aggregate instance.
    aggregateId: 'instance',
    payload: { value: 'complete' },
  });
  // @ts-expect-error Destination payloads retain their exact shape.
  serviceCommand.make({ payload: { value: 1 } });
  makeCommandOperation({
    destination: { aggregate, version: 1 },
    // @ts-expect-error Aggregate destinations require aggregate ordinary contracts.
    contract: serviceContract,
  });
  makeCommandOperation({
    destination: { service, version: 1 },
    // @ts-expect-error Service destinations require service ordinary contracts.
    contract: aggregateContract,
  });
  const claimsContract = makeServiceContractRelease(
    defineServiceContract('claimsChild'),
    {
      version: 1,
      payload: {},
      claims: Schema.Struct({ userId: Schema.String }),
    },
  );
  makeCommandOperation({
    destination: { service, version: 1 },
    // @ts-expect-error Recorded commands cannot supply actor claims.
    contract: claimsContract,
  });
  makeCommandOperation({
    destination: { service, version: 1 },
    // @ts-expect-error External implementations cannot be ordinary command destinations.
    contract: sendExternalReceiptV1,
  });
  makeAggregateContractRelease(defineAggregateContract('aggregateEmits'), {
    version: 1,
    payload: {},
    operations: {
      aggregateCommand,
      serviceCommand,
      external: playExternalOMove.external.definition.externalOperation,
    },
  });
  makeServiceContractRelease(defineServiceContract('serviceEmits'), {
    version: 1,
    payload: {},
    operations: {
      aggregateCommand,
      serviceCommand,
      external: sendExternalReceiptV1.external.definition.externalOperation,
    },
  });
}

/** Flat command variants preserve required submission fields. */
export function flatCommandVariantExamples(
  command: IAggregateCommand,
  serviceCommand: IServiceCommand,
) {
  if (command.kind === 'actor') {
    expectTypeOf(command.nodeId).toEqualTypeOf<string>();
    expectTypeOf(command.sessionName).toEqualTypeOf<string>();
    expectTypeOf(command.pushIndex).toEqualTypeOf<number>();
  }
  if (serviceCommand.kind === 'system') {
    // @ts-expect-error A System command does not carry Actor claims.
    void serviceCommand.claims;
    // @ts-expect-error A System command does not have an originating Node submission.
    void serviceCommand.nodeId;
  }
  const actorInput = {
    id: 'cmd_actor' as const,
    commandName: 'create',
    contractVersion: 1,
    payload: {},
    aggregateId: 'account_one',
    aggregateName: 'account',
    aggregateVersion: 1,
    kind: 'actor' as const,
    actorName: 'web',
    actorVersion: 1,
    claims: {},
  };
  // @ts-expect-error External requests produce ordinary continuations, with no external admitted kind.
  const external: IAggregateCommand['kind'] = 'external';
  // @ts-expect-error Actor commands require the complete Node tuple.
  const missingNode: IAggregateCommand = actorInput;
  // @ts-expect-error Actor commands cannot omit part of the Node tuple.
  const partialNode: typeof ActorCommandSchema.Type = {
    ...actorInput,
    nodeId: 'node_partial',
  };
  void [missingNode, partialNode, external];
}

/** Public synchronous staging exposes submission coordinates before Node allocation. */
export function stagingIdentityExamples(
  aggregate: ReturnType<typeof stageAggregateSessionCommand>,
  service: ReturnType<typeof stageServiceSessionCommand>,
) {
  if (aggregate._tag === 'Success') {
    expectTypeOf(aggregate.success.sessionIndex).toEqualTypeOf<number>();
    // @ts-expect-error Canonical identity is allocated by AggregateNode after staging.
    void aggregate.success.id;
  }
  if (service._tag === 'Success') {
    expectTypeOf(service.success.sessionIndex).toEqualTypeOf<number>();
    // @ts-expect-error Canonical identity is allocated by ServiceNode after staging.
    void service.success.id;
  }
}

/** A contract-only view accepts a richer session without losing payload correlation. */
export function compatibleAggregateCommandSessionExamples(
  stage: typeof stageAggregateSessionCommand,
) {
  const updateText = makeAggregateContractRelease(
    defineAggregateContract('updateText'),
    {
      version: 1,
      payload: {
        brickId: modelId({ model: { name: 'brick', abbreviation: 'brk' } }),
        content: primitives.text(),
      },
      result: Schema.String,
    },
  );
  const updateImage = makeAggregateContractRelease(
    defineAggregateContract('updateImage'),
    {
      version: 1,
      payload: {
        brickId: modelId({ model: { name: 'brick', abbreviation: 'brk' } }),
        url: primitives.text(),
      },
    },
  );
  const updateSite = makeAggregateContractRelease(
    defineAggregateContract('updateSite'),
    {
      version: 1,
      payload: { title: primitives.text() },
    },
  );
  const definition = makeAggregateSessionDefinition({
    systemName: 'test',
    aggregateName: 'user',
    aggregateVersion: 1,
    actorName: 'user',
    actorVersion: 1,
    sessionName: 'user',
    claimsSchema: Schema.Struct({}),
    models: userAggregateReleaseV1.models,
    contracts: { updateText, updateImage, updateSite },
  });
  function verify(host: IAggregateSession<typeof definition>) {
    const session: IAggregateCommandSession<{
      updateText: typeof updateText;
      updateImage: typeof updateImage;
    }> = host;
    const textPayload = { brickId: 'brk_one' as const, content: 'Hello' };
    const staged = stage({
      session,
      contractName: 'updateText',
      payload: textPayload,
    });
    if (staged._tag === 'Success') {
      expectTypeOf(
        staged.success.stagingOutcome.result,
      ).toEqualTypeOf<string>();
    }
    // @ts-expect-error Contracts not in the compatible session cannot be submitted.
    stage({ session, contractName: 'updateSite', payload: { title: 'Hi' } });
    // @ts-expect-error A command cannot accept another command's payload.
    stage({ session, contractName: 'updateImage', payload: textPayload });
    const invalidId: string = 'invalid';
    stage({
      session,
      contractName: 'updateText',
      // @ts-expect-error Payload inference cannot widen a required model ID.
      payload: { brickId: invalidId, content: 'Hi' },
    });
    function mismatched(name: 'updateText' | 'updateImage') {
      // @ts-expect-error An independent name union is not a correlated command.
      stage({ session, contractName: name, payload: textPayload });
    }
    function paired(
      command:
        | {
            contractName: 'updateText';
            payload: { brickId: `brk_${string}`; content: string };
          }
        | {
            contractName: 'updateImage';
            payload: { brickId: `brk_${string}`; url: string };
          },
    ) {
      stage({ session, ...command });
    }
    void [mismatched, paired];
  }
  void verify;
}

export function knownCommandInference(command: IServiceCommand) {
  const original = makeServiceContractRelease(
    defineServiceContract('inference'),
    {
      version: 1,
      payload: { name: primitives.text() },
      guard: ({ command }) => {
        expectTypeOf(command.kind).toEqualTypeOf<
          'actor' | 'agent' | 'system'
        >();
        expectTypeOf(command.payload).toBeUnknown();
        return Effect.void;
      },
    },
  );
  const upgraded = upgradeServiceContractRelease(original, {
    version: 2,
    payload: { count: primitives.number() },
    up: ({ payload }) => Effect.succeed({ ...payload, count: 1 }),
  });
  type IServiceInputs = IInferContractCommands<typeof upgraded>;
  type IFirstPayload = Extract<
    IServiceInputs,
    { contractVersion: 1 }
  >['payload'];
  type ISecondPayload = Extract<
    IServiceInputs,
    { contractVersion: 2 }
  >['payload'];
  expectTypeOf<IFirstPayload>().toEqualTypeOf<
    IInferCommandPayload<typeof original.payload>
  >();
  expectTypeOf<ISecondPayload>().toEqualTypeOf<
    IInferCommandPayload<typeof upgraded.payload>
  >();
  expectTypeOf<IFirstPayload>().not.toMatchTypeOf<ISecondPayload>();
  if (Schema.is(upgraded.knownCommandSchema)(command)) {
    if (command.contractVersion === 1) {
      expectTypeOf(command.payload).toMatchTypeOf<{ name: string }>();
      // @ts-expect-error The V1 payload has no V2 count.
      void command.payload.count;
    } else if (command.contractVersion === 2) {
      expectTypeOf(command.payload).toMatchTypeOf<{
        name: string;
        count: number;
      }>();
    }
  }
}
