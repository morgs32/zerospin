---
title: SDK authoring reference
description: The current root SDK exports, grouped by the application task they support and their execution boundary.
order: 1
---

## Import boundary

```ts
import * as sdk from '@zerospin/sdk';
```

The root SDK is the public barrel for backend system and domain authoring. It re-exports server-only modules, including owner releases, configuration and external implementations. Browser modules import the restricted [`@zerospin/sdk/browser`](/reference/browser#browser-sdk) entry instead. React bindings live in `@zerospin/react`; they are not an SDK React subpath.

This reference follows the [current root barrel](https://github.com/morgs32/zerospin/blob/main/packages/sdk/src/index.ts) and current unreleased workspace source. Use matching workspace packages rather than assuming a registry version has these APIs. A declaration factory normally runs at module evaluation; an Effect is a description of work to run later; canonical operation definitions expose codecs and lazy constructors, named program methods record deferred descriptions, and programs return only their domain result.

## Declaration constructors

Call each Zerospin `make*` declaration constructor directly with its configuration written as an inline object literal. For constructors that also take an identity, pass it in its documented position, as in `makeAggregateRelease(user, { version: 2, actors: { user: userActorV1 } })`. Never wrap the constructor in an application factory. See the [owner release example](/handbook/aggregates-and-services#declare-the-owner-explicitly).

## Model and query authoring

| Export                    | Inputs                                                  | Result and use                                                                                              |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `defineModel`             | `{ name, abbreviation }`                                | Stable model identity for a version declaration                                                             |
| `makeModelVersion`        | Model identity; `{ version, attributes, indexes, ... }` | Executable exact model with codecs, table, and resource shape; framework metadata is supplied automatically |
| `makeLimitedModelVersion` | Model identity; `{ version, attributes, indexes }`      | Browser-safe exposed attributes with canonical identity/version and framework fields                        |
| `upgradeModelVersion`     | Previous model; `{ version, attributes, indexes? }`     | New model declaration; patch entries replace/add descriptors and `null` removes an existing attribute       |
| `primitives`              | Primitive-specific options                              | Descriptors for model attributes and contract payload fields                                                |
| `makeQueryDbVersion`      | `{ models }`                                            | Typed query builder/database declaration for actor/agent selections; does not initialize a browser store    |
| `makeId`                  | Model declaration                                       | Effect returning a prefixed resource ID; requires `CuidFactory`                                             |
| `makeIdSchema`            | Model definition with `abbreviation`                    | Effect Schema codec validating prefixed resource IDs; preserves the literal prefix type                     |
| `prefixId`                | Model declaration, unprefixed suffix                    | Synchronous typed prefixed ID; throws if the suffix already has the same prefix                             |
| `CuidFactory`             | Layer/service dependency                                | ID factory used by `makeId` and generated execution work                                                    |
| `NanoIdFactory`           | Built-in Layer/service dependency                       | Nano ID generation support supplied by backend config                                                       |

`primitives` exposes `text`, `integer`, `number`, `boolean`, `date`, `enum`, `json`, `foreignKey`, `ref`, `self`, `cursor`, and `primaryKey`. Common scalar options include `nullable`, `unique`, and `defaultValue` where that primitive supports them. `enum` supplies `values`; `json` supplies its Effect `schema`; `foreignKey` supplies an `abbreviation`. Model fields already have a primary key supplied by the framework.

`ref({ table, relation, inverse, ... })` establishes a typed table relation. Shopping uses `table: cartV1.table` for cart items. A plain `foreignKey({ abbreviation })` describes an ID-shaped value without declaring that relation. See [models and IDs](/handbook/models-and-ids) and [primitive declarations](https://github.com/morgs32/zerospin/blob/main/packages/shapes/src/primitives.ts) for complete options.

## Owner and actor authoring

| Export                                        | Inputs                                                                                                                             | Result and failure boundary                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `defineAggregate` / `defineService`           | `{ name }`                                                                                                                         | Stable owner definition; invalid declaration input throws                                                            |
| `makeAggregateRelease`                        | Aggregate definition; `{ version, models?, actors, agents?, system?, external?, guards?, layer? }`                                 | Exact aggregate release; execution inventory derives from explicit invocation grants                                 |
| `makeServiceRelease`                          | Service definition; `{ version, models, actors?, agents?, system?, external?, layer? }`                                            | Exact service release owning its models and explicit invocation grants                                               |
| `defineAggregateActor` / `defineServiceActor` | `{ name }`                                                                                                                         | Stable actor definition                                                                                              |
| `makeAggregateActorRelease`                   | Actor definition; version, `db`, `exposedModels`, `identity`, authentication, contracts, selections, optional authorization        | Exact aggregate capability; authoritative ownership remains checked on the server                                    |
| `makeServiceActorRelease`                     | Actor definition; version, `db`, `exposedModels`, `identity`, authentication, contracts, selections, optional guards/authorization | Exact shared-service capability                                                                                      |
| `updateAggregateActorRelease`                 | Previous actor; new version and changed fields                                                                                     | New declaration; named contracts and selections merge with prior ones; changed query DB requires matching selections |
| `updateServiceActorRelease`                   | Previous actor; new version and changed fields                                                                                     | New declaration; selections merge, supplied capability fields replace their previous declarations                    |
| `makeActorIdentity`                           | `{ claims: claimsSchema, actorPath: RoutePattern.parse(...) }`                                                                     | Verified identity field schema and typed SQL placeholders; unknown path fields are rejected                          |
| `makeGuard`                                   | `{ models, payload: Schema, claims: Schema, failures?, program }`                                                                  | Reusable Effect check taking `{ db, payload, claims }`; scopes its read capability to the declared models            |

Authentication converts credentials into claims. Aggregate authentication receives `{ aggregateId, credentials }`; service authentication receives `{ credentials }`. A service can explicitly choose `authentication: 'none'`. Actor selection queries use `identity.sql.placeholder('claimField')`; the field must exist in the identity path and encode/decode as a string.

Do not read “selection” as write authorization. Exposing a cart query does not grant permission to mutate any cart ID. See [actors and authorization](/handbook/actors-and-authorization), [the aggregate actor](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/aggregates/user/actors/userActorV1.ts).

Ordinary releases have no fixed invocation kind or principal binding. Grant the
same canonical object explicitly through Actor, Agent or `system` maps. Owner
construction derives one `contracts` inventory from those grants and `external`,
coalescing repeated references to the same object and rejecting different objects
or versions under one command name. Actor grants validate claims; Agent and
`system` grants require claims-free ordinary contracts. External implementations
belong only in `external`. Session definitions and locks contain the selected
Actor capabilities, without unrelated System or external grant maps.

## Contract authoring

| Export                                                                        | Inputs                                                                                                                          | Result and use                                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `defineAggregateContract` / `defineServiceContract`                           | Command name string                                                                                                             | Canonical immutable definition in the concrete aggregate or service family                                                               |
| `makeAggregateContractRelease` / `makeServiceContractRelease`                 | Definition; `{ version, payload, models?, operations?, claims?, failures?, guard?, result?, program? }`                         | Canonical version with checked `evaluate(input)`, `operationsSchema` and result codec; one shared program returns only its domain result |
| `upgradeAggregateContractRelease` / `upgradeServiceContractRelease`           | Previous contract; version, payload/model patches, `up`, optional `down`, current named operation map, result codec and program | New declaration and explicit Effect-returned payload conversion edge                                                                     |
| `defineAggregateExternalContract` / `defineServiceExternalContract`           | `{ name, version, payload, response, timeoutMs? }`                                                                              | Pure browser-safe external definition with an exact `.externalOperation` operation definition                                            |
| `makeAggregateExternalContractRelease` / `makeServiceExternalContractRelease` | Exact pure definition; `{ request, onSuccess, onFailure }`                                                                      | Backend provider request and ordinary continuation branches using the definition's codecs                                                |
| `makeCommandOperation`                                                        | `{ destination: { aggregate: definition, version } or { service: definition, version }, contract, onSuccess?, onFailure? }`     | Browser-safe operation definition for an exact `system`-granted claims-free ordinary command                                             |
| `findFirst` / `findMany`                                                      | `{ db, model, where?, with?, ...queryOptions }`                                                                                 | Read Effects scoped to declared model fields; optional row or row array                                                                  |
| `ZerospinSuccess.schema`                                                      | `{ code, data: Schema }`                                                                                                        | Typed domain outcome codec; `.make({ data })` constructs its value                                                                       |
| `makeAggregateContractExtension`                                              | Exact ordinary Aggregate contract and `{ models, operations, program }`                                                         | Server-only behavior applied after the shared operations in the same transaction                                                         |

`models` grants reads through explicitly selected fields, for example `{ item: { model: itemV1, fields: ['name'] } }`. The ID is always available; use `db.models.item` for reads in the guard and program. Compatible later model versions can add unrelated fields without changing the contract. A named `operations` definition map grants exact version-specific mutation permission, for example `{ createItem: itemV1.operations.create }`. Omission supplies no recording methods. Ordinary programs may record model, command and same-family external operations. Browser staging validates the whole batch and applies only model operations; it allocates no destination IDs and invokes no transport or provider.

Programs yield the injected recording-method Effects and return only their domain result. Omit the result codec only when that result is undefined; persistence records null. Ordinary upgrades inherit omitted declaration fields, including operation maps and result codecs; supplied operation entries replace matching keys. Payload/model patches use `null` to remove an entry. Omitted `up` is an identity edge with source/destination validation; reverse `down` adapters remain explicit. A payload-only public contract can omit `program`; checked evaluation then returns an empty batch with an undefined result.

External backend implementations declare a provider `request` and
`onSuccess` and `onFailure` branches. Each branch names an ordinary
continuation contract and an Effect payload builder. The emitting release
constructs the ordinary payload from the frozen request and the first retained
observation. Register each branch's exact ordinary version in the emitting
release's `contracts` inventory. The recorded operation and selected branch
authorize the follow-up. Successor releases can keep an inventory entry for
replay and use ordinary version adapters.

Checked evaluation scopes reads, runs the guard, collects operations and validates
the complete batch and result without applying writes. Optimistic staging and
canonical execution use the same ordinary program. Actor commands retain selected
rows and exposed columns, and reads do not see earlier recorded model operations.
The owning canonical transaction prepares complete outgoing intents and encodes the
result before committing its model changes and `outcome`. Failure retains no
successful output or dispatchable work. See [contracts and operations](/handbook/contracts-and-operations)
and [external work](/handbook/external-work).

## Operation definitions and recording methods

Models expose canonical operation definitions with `.schema` and `.make`. Pure external definitions expose browser-safe `.externalOperation` operation definitions. Declare an operation definition in the named map to receive a corresponding program method: `operations: { createItem: item.operations.create }` supplies `operations.createItem(props)`. That method lazily constructs, validates, snapshots and records one description, returning a void Effect. Guards receive no recording methods.

| Operation definition                    | Constructor or recording-method arguments  | Behavior                                                                                       |
| --------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `model.operations.create`               | `{ resourceId, attributes }`               | Complete create; refuses missing required attributes and excess fields                         |
| `model.operations.update`               | `{ resourceId, attributes, mask? }`        | Partial update; a supplied mask retains only its named attributes                              |
| `model.operations.delete`               | `{ resourceId }`                           | Deletion for the exact model and resource                                                      |
| `model.operations.move`                 | `{ resourceId, property, prevId, nextId }` | Ordered-property move; property and value types remain correlated                              |
| Aggregate external `.externalOperation` | `{ payload }`                              | Exact external declaration; aggregate identity and release come from the originating execution |
| Service external `.externalOperation`   | `{ payload }`                              | Exact external declaration; service identity and release come from the originating execution   |

Outside a program, `definition.make(props)` returns a lazy Effect producing the decoded operation. `definition.schema` encodes and decodes that complete operation, restoring its captured canonical model or contract reference. A contract's derived `operationsSchema` handles complete permitted batches. Portable identities and permission facts are independent of local map names.

The source Chain logs an explicit terminal admission refusal with the source operation position, destination command identity and refusal code, then consumes its pending row. Transport errors, lost replies and admission capacity leave delivery pending. For executed commands, the source Chain retains the destination’s finalized outcome on `commandOperationOutbox` until it admits the continuation and deletes that row atomically. The branch payload Effect receives the frozen outgoing payload and the decoded success or recorded destination failure. Authors choose the business facts to preserve in the continuation payload.

Declared ordinary command failures finalize in `outcome.result`. AggregateChain
or ServiceChain retains that outcome. Execution defects leave the admitted
command pending for recovery.

`useAggregateCommandOutcome({ session, submission })` from `@zerospin/react` observes an exact `{ sessionId, sessionIndex }` returned by staging. It reports `pending` until materialization, then `succeeded` or `failed` with the Aggregate index and, on failure, the public failure. Missing, replaced, or differently bound session rows report `unknown`; neither optimistic staging nor an absent row proves success. This observation is scoped to the live replica, not a durable outcome lookup across a recreated session.

An external operation definition captures the exact pure definition. The originating aggregate or service release must register a same-family backend implementation under `external`, consuming that same object. Its recording method accepts only `{ payload }`; it does not select another owner or release. A payload property named `aggregateId` does not establish framework scope. For another ordinary command in the same System, use `makeCommandOperation`. System composition and original preparation resolve its exact owner definition, release version and `system`-granted contract object; matching names grant no authority. See [external work](/handbook/external-work).

In synchronous tab/server evaluation, suspension is refused and the owning savepoint rolls back. Provider calls belong in external requests. Escaping evaluation failure exposes no batch; retrying the complete evaluation starts a fresh collector. [Shopping's quotation continuation](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/aggregates/user/contracts/getExternalPurchaseQuoteV1.ts) validates retained lines before recording authoritative pricing and payment work.

## System config and administrative commands

| Export                                                              | Inputs                                        | Result and boundary                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `makeSystem`                                                        | `{ name, aggregates?, services?, ... }`       | Validated executable system; owner registries use exact name/version keys                      |
| `makeSystemSpec`                                                    | `{ system }`                                  | Synchronous projection to serializable `ISystemSpec` display metadata; run outside the browser |
| `makeConfig`                                                        | `{ system, systemId, telemetry?, wrangler? }` | Backend identity and deployment options; imports server-only code                              |
| `validateAggregateSessionCommand` / `validateServiceSessionCommand` | `{ session, contractName, payload }`          | Synchronous `IResult<void, ...>` rehearsal; no retention or resource writes                    |
| `ZerospinApiUrl`                                                    | Layer-provided string                         | API base URL dependency                                                                        |
| `PublishableKey`                                                    | Layer-provided `Redacted<string>`             | Public client key dependency, redacted in ordinary logs                                        |
| `ZEROSPIN_SDK_VERSION`                                              | Constant from package metadata                | SDK manifest version; does not attest backend/system declaration compatibility                 |

Acquire a typed `ISystemApi` and call
`api.executeServiceCommand(serviceRelease, { contractName, payload })` or
`api.executeAggregateCommand(aggregateRelease, { aggregateId, contractName, payload })`.
Names and payloads infer from the selected release's readonly `system` map; an
Actor or Agent grant alone does not make a command eligible. The facade derives
owner/contract coordinates and `kind: 'system'`, validates the payload and freezes
ID-less input when the call constructs its Effect. Each execution allocates a new
command inside AggregateChain or ServiceChain, including a retry after an ambiguous
timeout. Canonical IDs are opaque and must not be parsed.

Both methods return `outcome: { result: Success | Failure, finalizedAt }`.
Inspect `outcome.result._tag`: a business Failure is outcome data, while invocation
failures use the Effect error channel. Every invocation awaits only its newly allocated command position. Authored programs own repeated-business behavior; the facade adds no implicit retry or outcome cache. HTTP and
Native acquisition use this same typed facade. See [the server guide](/guides/server-and-external-work)
for calls and [administrative owner reads](#administrative-owner-reads) for HTTP
acquisition.

Use the [CLI](/reference/cli) to run, seed, and deploy an authored config. The root SDK does not export browser session constructors, React hooks, or the service staging helper; use their documented browser imports.

Use `sdk.makeSystemSpec({ system })` in server or build code to supply metadata to [`SystemDiagrams`](/guides/system-diagrams). Projection needs the authored declaration, without starting a Zerospin runtime or fetching backend data. Pass the resulting metadata through the application's existing data-loading path; keep executable declarations out of the browser bundle.

`ISystemSpec` stores complete model, Contract, Actor and Agent definitions in
owner-local version registries. Each release binds those definitions by name and
version; Contract and Agent read models use version bindings, and mutation metadata
uses `{ modelName, version }`. Actor exposed-model projections remain inline. Pass
the normalized JSON directly to `SystemDiagrams`; it resolves the bindings. This
metadata shape does not change native declaration APIs or browser session locks.

## Administrative owner reads

Use the exported core subpaths for a server-only typed SystemApi. The root SDK
exports `ISystemApi` and query authoring; it does not export `getSystemApi` or
`SecretKey`. Provide the endpoint and redacted secret in the caller's Layer:

```ts
import { SecretKey } from '@zerospin/core/services/SecretKey';
import { getSystemApi } from '@zerospin/core/utils/getSystemApi/getSystemApi';
import * as sdk from '@zerospin/sdk';
import { Effect, Layer, Redacted } from 'effect';
import { marketplaceServiceReleaseV1 } from './marketplaceServiceReleaseV1';

const readProducts = Effect.gen(function* () {
  const systemApi = yield* getSystemApi();
  const db = sdk.makeQueryDbVersion({
    models: marketplaceServiceReleaseV1.models,
  });
  return yield* systemApi.executeServiceQuery({
    serviceName: marketplaceServiceReleaseV1.name,
    serviceVersion: marketplaceServiceReleaseV1.version,
    query: db.query.product.findMany({}),
  });
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      Layer.succeed(sdk.ZerospinApiUrl, 'https://api.example.com'),
      Layer.succeed(SecretKey, Redacted.make('YOUR_SERVER_SECRET')),
    ),
  ),
);
```

Run that Effect inside the application's backend runtime. The typed selection
controls returned rows, relations and projected columns. Aggregate reads use
`executeAggregateQuery` with the exact Aggregate name/version and `aggregateId`.
`findFirst` returns `undefined` when absent; `findMany` returns `[]`.
Declarative filters, ordering, limits and offsets are supported; callback SQL,
`RAW`, placeholders and `extras` are refused at this remote boundary.

These are current materialized owner reads without Actor filtering. They create
no admitted command, model changes, `serviceIndex` or command `outcome`, and
reserve no state for a later command. Keep that secret capability on the server;
browser reads use authenticated Actor selections and local session queries.
Each method execution uses its own scoped HTTP capability chain. A transport
rejection can leave a remote command's result unknown; acquisition alone performs
no request and the transport does not retry automatically. See
[the typed SystemApi](https://github.com/morgs32/zerospin/blob/main/packages/core/src/systemApi/ISystemApi.ts)
and [HTTP acquisition](https://github.com/morgs32/zerospin/blob/main/packages/core/src/utils/getSystemApi/getSystemApi.ts).

## Test authored behavior

Import `makeSystemHarness` from the separate Node-only `@zerospin/sdk/testing`
entrypoint for command execution, typed queries, deterministic providers and
scheduled behavior in scoped disposable SQLite. Follow
[the testing guide](/guides/test-authored-behavior) for setup and proof limits.

## Results and failure utilities

| Export                                          | Inputs                                                            | Result and use                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `resolveContractResult`                         | Contract; `{ commandName, contractVersion, result }`              | Effect decoding a retained result and checking exact identity; mismatches fail         |
| `resolveFailure`                                | Contract or `undefined`; public JSON failure                      | Effect recognizing known declared failures while retaining public failure information  |
| `resolveSessionFailure`                         | Aggregate session definition, command name, public failure        | Contract lookup plus failure recognition                                               |
| `ContractError`, `ActorError`, `AggregateError` | `.schema({ code, extra?, ... })` declaration                      | Scoped business failure constructors/codecs used at the corresponding policy use site  |
| `ZerospinError` / `makeZerospinError`           | Error props or a code string                                      | Framework error class and constructor; errors are yieldable in Effect programs         |
| `ensureZerospinError`                           | `{ code, error, message?, preferCauseMessage?, extra?, status? }` | Returns an existing ZerospinError unchanged, or constructs one using the fallback code |
| `isZerospinError`                               | Unknown value                                                     | Type guard for a Zerospin error                                                        |
| `encodeError`                                   | Error                                                             | Effect converting an error into public transport JSON                                  |
| `matchZerospinErrorCode`                        | `{ failure, onMatch, onUnknown }`                                 | Typed dispatch over recognized codes; always provide the unknown handler               |
| `prettyUnknownFailure`                          | Unknown failure/cause                                             | Bounded diagnostic text for logging                                                    |
| `getBackendTrace`                               | Unknown error                                                     | Backend `{ traceId, spanId }` reference if present, otherwise `null`                   |

Direct `IResult` envelopes use `_tag: 'Success'` with `success` or `_tag: 'Failure'` with `failure`. A retained canonical `ICommandOutcome` is `{ result: Success | Failure, finalizedAt }`; select the branch with `outcome.result._tag`. `finalizedAt` sits outside both result branches. `ZerospinSuccess` is an authored domain value that can appear inside a result. Local staging returns the command with `stagingOutcome: { result, completedAt }`; session notifications can report later admission/execution refusals. See [failures and recovery](/handbook/failures-and-recovery).

## Exported types

These type-only exports support application boundaries without hand-writing shapes:

| Types                                                                                    | Use                                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `IAggregateId`, `ISystemId`, `ISystemConfig`                                             | Owner/deployment identities and authored config                                        |
| `ISystemSpec`                                                                            | Serializable declaration metadata returned by `makeSystemSpec`                         |
| `IInferResource`, `IInferCommandPayload`, `IInferPayloadInput`                           | Resource type, decoded payload, and accepted payload input from declarations           |
| `IInferContractOperations`, `IInferContractResult`, `IInferFailure`                      | Operation-codec element types, result-codec types and declared failures                |
| `ICommand`, `IAggregateCommand`, `IServiceCommand`                                       | Commands carrying contract and owner provenance; command identity is `id`              |
| `ISystemApi`                                                                             | Typed administrative command and owner-query capability                                |
| `ISeedProgram`                                                                           | Named CLI `seeds` function: `(api: ISystemApi) => Effect.Effect<void, unknown, never>` |
| `ICommandOutcome`                                                                        | Retained canonical result and its `finalizedAt` time                                   |
| `IBrowserCommand`                                                                        | Browser-selected command shape                                                         |
| `IAnyAggregateActorRelease`, `IAggregateActorAuthorization`, `IAggregateQuerySelections` | Aggregate capability declaration/authorization/query types                             |
| `IAnyServiceActorRelease`, `IServiceActorAuthorization`, `IServiceQuerySelections`       | Corresponding shared-service capability types                                          |
| `IDb`, `IResourceDbConfig`                                                               | Typed database configuration for declarations that need it                             |
| `IResult`, `IRecognizedFailure`                                                          | Direct result envelope and locally recognized failure                                  |
| `IErrorJson`, `IAnyError`, `IZerospinError`, `IZerospinErrorJson`                        | Error classes and transport representations                                            |

Prefer the concrete inferred declaration type in application code. Broad `IAny...` types are useful at generic tooling boundaries; they intentionally lose the exact names and versions that keep normal feature code checked.
