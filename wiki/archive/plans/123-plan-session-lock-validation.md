# Validate session locks against one authored projection

Status: Implemented and verified in the approved goal on 2026-10-11.

Both validators manually re-project model shapes, sorted indexes, payloads and result/failure JSON schemas, then construct two copies of selected model maps. The service validator also traverses records with forbidden `Object.entries` loops. This duplicates the same authored definition semantics that core lock constructors and SystemSpec project. One canonical pure projection should determine equality everywhere; admission should own selection/authority, not invent another projection.

Source: [service lock validator](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.ts), [aggregate lock validator](../../../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/validateAggregateSessionLock.ts), [service authorizer](../../../packages/system-worker/src/ServiceAccessApi/authorize/authorizeServiceSession/authorizeServiceSession.ts). Core projection ownership remains with the root plan: `core/src/aggregateSession/make/makeAggregateSessionLock.ts`, `core/src/serviceSession/make/makeServiceSessionLock.ts`, and SystemSpec projections.

1. Resolve exact authored release/actor and the submitted selection. Keep authored objects as executable authority; pure specs are comparison data only. Aggregate locks require actor origin and the exact actor version. Service actor resolution remains exact.
2. Select requested models/contracts with `mapValues` and fail through Effect before building the expected lock. Aggregate models may be a subset of all aggregate release models; this schema availability does not grant resource visibility. Service models remain a subset of the actor's captured selections. Preserve exact model versions. Preserve aggregate historical contract resolution through `getVersion`; service locks currently accept only each authored current contract version. Preserve mapping-original spec semantics and aggregate operation-model closure. These selection rules are distinct domain constraints, not whole-lock equality substitutes.
3. Feed these exact selected authored definitions to the core canonical projection functions. Construct the complete expected origin/claims declaration/session name from the resolved actor and requested logical name; never copy a submitted claims schema into the expected lock.
4. Compare the decoded complete submitted lock against the expected lock once. Build the returned session spec from that accepted expected lock; aggregate contract operation models remain available from the selected authored declarations. Delete handwritten encodeShape/index/result/failure projections and duplicate `resolvedModels`/`selectedSpecModels` maps.
5. Preserve public refusal codes for missing origin/actor/version/contract and `*-session-lock-unsupported` for incompatible locks. Preserve missing versus mutation diagnostics using the resolved selection and a structural diff. Claims declaration or session-name mismatch remains refused before returning a capability. Do not add a second field-by-field equality loop to preserve incidental diagnostic ordering; if more than one malformed field is present, the canonical whole-lock diff may identify a different first mutation path. Record that narrow diagnostic ordering change in the PR, with valid-lock behavior unchanged.

The proposed parent shapes are schematic valid TypeScript generator bodies; procedure parameters are exact domain values, not a bag of runtime context:

```ts
const validateAggregateSessionLock = Effect.fn(function* (
  props: AggregateLockRequest,
) {
  const actor = yield* resolveAggregateLockActor(props);
  const selection = yield* selectAggregateLockDeclarations(props, actor);
  yield* requireAggregateOperationModels(
    selection,
    props.aggregateSessionLock.models,
  );
  const expected = makeAggregateSessionLock({
    kind: 'aggregate',
    aggregateName: props.aggregateName,
    aggregateVersion: props.aggregateVersion,
    actorName: actor.name,
    actorVersion: actor.version,
    claimsSchema: actor.identity.claimsSchema,
    sessionName: props.sessionName,
    contracts: selection.contracts,
    models: selection.models,
    modelNames: Object.keys(selection.models).toSorted(),
  });
  yield* requireSupportedAggregateLock(props.aggregateSessionLock, expected);
  return {
    actor,
    sessionSpec: makeValidatedAggregateSessionSpec(props, expected, selection),
  };
});

const validateServiceSessionLock = Effect.fn(function* (
  props: ServiceLockRequest,
) {
  const owner = yield* resolveServiceLockOwner(props);
  const selection = yield* selectServiceLockDeclarations(props, owner.actor);
  const expected = makeServiceSessionLock({
    kind: 'service',
    serviceName: props.serviceName,
    serviceVersion: props.serviceVersion,
    actorName: owner.actor.name,
    actorVersion: owner.actor.version,
    claimsSchema: owner.actor.identity.claimsSchema,
    sessionName: props.sessionName,
    contracts: selection.contracts,
    models: selection.models,
    modelNames: Object.keys(selection.models).toSorted(),
  });
  yield* requireSupportedServiceLock(props.serviceSessionLock, expected);
  return makeValidatedServiceSessionSpec(props, expected);
});
```

Use the existing `makeAggregateSessionLock` and `makeServiceSessionLock` pure builders, whose canonical projection ownership is settled by Plan106. The typed literal supplies selected authored models/contracts and resolved actor identity; submitted serialized fields only select declaration keys/versions and logical name. Never copy submitted claims JSON or cast serialized specs into an authored release. The current complete declaration props shown above satisfy the existing builders; Plan106 may narrow their props to the exact projection inputs without adding a new wrapper. Helpers should own substantial actor/selection/closure/comparison phases; keep the return construction inline if smaller than the named procedure shown.

Affected callers: `AggregateVersionRepo.authorizeSession` and `ServiceAccessApi.authorize`/`authorizeServiceSession`; their admitted claims/context remain unchanged. Agent lock constructors share the core projection but agent sessions do not pass through the actor-only aggregate validator.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    AggregateVersionRepo/authorizeSession/
      ~ validateAggregateSessionLock.ts
      + selectAggregateLockDeclarations.ts
    ServiceAccessApi/authorize/authorizeServiceSession/
      ~ validateServiceSessionLock/validateServiceSessionLock.ts # modify
      + validateServiceSessionLock/selectServiceLockMembers.ts # create
    + sessionLockValidation/requireSupportedSessionLock.ts # create only if both share meaningful diff/error construction
  packages/core/src/
    ~ aggregateSession/make/makeAggregateSessionLock.ts # related root-owned plan
    ~ serviceSession/make/makeServiceSessionLock.ts # related root-owned plan
```

No new persistent data, transaction or lifecycle is introduced. Definition resolution/comparison is pure or synchronous authored metadata work. Admission audit ownership stays in `auditAdmission`; failures prevent capability creation. Preserve full Effect Causes rather than replacing mixed/defect/interruption reasons with a typed refusal. Do not swallow failure while traversing records; use `mapValues` to construct Effect values, then `Effect.all` in deterministic authored order where failure order matters.

Implementation order: implement Plan106 canonical builder projections and lineage semantics; implement aggregate selection/closure plus expected projection; implement service selection/expected projection; eliminate redundant imports/maps/loops; review real authorizers and browser/session-lock constructors; then run existing Nx gates. No new tests/fixtures/runners/configuration are authorized.

Verification: current `system-worker` has existing `lib`, `ts`, `lint` targets, no test target. Run `pnpm nx run-many -p core -t lib,lint,tsc:typecheck` followed by `pnpm nx run-many -p system-worker -t lib,ts,lint` with normal dependencies/cache after root shared changes settle. If browser lock constructor typings change, include browser `lib,ts,lint` gates resolved through `pnpm nx show project browser --json`. Existing TicTacToe and Shopping declarations can supply real subset locks, unsupported versions, altered payload/result/failure/index/claims declarations, and aggregate missing operation-model closure. Review/run through existing APIs only, with no created harness. Runtime cases were not executed during this review, so compile/lint cannot establish behavior. Invalid primitives remain RPC/schema-boundary responsibility. Source-specific `getVersion` failure codes need preserving explicitly in implementation.

Postimplementation: update glossary only if the pure authored projection gains a durable domain term; this is normally a shared projection ownership decision governed by the root ADR, not an additional ADR. Update validator comments and relevant session architecture citations. Archive the plan only after both validators/callers and required verification are complete.

## Implementation progress — 2026-10-11

Both validators select available exact declarations, construct the expected complete lock with shared projections, compare once, and diagnose only mismatch. Historical aggregate availability and mapped-public model closure remain explicit; service selection stays on its current exact actor. Lock construction participated in disposable declaration/source checks, and scoped validator/projector lint passed with zero warnings/errors. The existing-declaration validator matrix below now establishes the stated lock acceptance/refusal cases; successful compilation alone does not establish refusal behavior.

### Existing-declaration validator evidence — 2026-10-11

An explicitly permitted inline invocation passed all 38 cases through the actual TicTacToe aggregate release, actual Shopping System, canonical lock constructors and exported aggregate/service lock validators (`/tmp/zerospin-goal-123-existing-declarations-inline.log`, exit 0). The service validator receives the existing authored System value through its ordinary Effect service; no host binding, new authored declaration/lineage, test file, fixture, runner or configuration was created. Every submitted lock also passes its existing wire schema before validator execution.

1. Complete locks, public mapped-original facts, current contract subsets, models-only aggregate selection, cart/createCart service selection and empty selections are accepted. Returned specs equal the submitted canonical locks and retain the exact existing actor capability.
2. Aggregate missing actor and unsupported actor version preserve `actor-not-found` and `actor-version-unsupported`. Service actor absence/version preserves its existing `actor-version-invalid` resolver boundary. Missing service owner/release, missing model name/version, unavailable aggregate contract, noncurrent service contract and external-contract denial preserve their distinct codes/reasons. An unavailable aggregate historical version remains `contract-version-unsupported`; omitting a required aggregate operation model remains `operation-model-missing` within `aggregate-session-lock-unsupported`.
3. Altered payload, result, failure, index, claims and model-abbreviation facts refuse with the family's `*-session-lock-unsupported`, `definition-mutated` and a concrete whole-lock diff path. A changed logical session name preserves the existing family's specific mismatch reason. Validator calls do not mutate submitted locks; rebuilding both canonical locks after all cases reproduces the unchanged original projections.

These are direct existing metadata/validation API checks, not an end-to-end Workerd authentication/admission journey. The earlier existing-declaration matrix had no available historical lineage; its unsupported-history refusal did not establish historical acceptance. The authorized disposable lineage case below now covers that remaining criterion.

### Verified source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Authorized historical-lineage evidence — 2026-10-11

After the human explicitly authorized disposable `/tmp` verification fixtures/runners, `/tmp/zerospin-framework-goal-server-qvh4z87h/historical-lock.ts` constructs an actual `createGame@2.0.0` with the production upgrade factory and the existing TicTacToe `createGame@1.0.0` predecessor. A complete factory-built current actor and aggregate release retain that lineage. The production aggregate validator accepts the canonical lock requesting `createGame@1.0.0`, returns that exact historical version, retains the exact current actor capability and reproduces the complete submitted canonical lock (`/tmp/zerospin-goal-123-historical-lock-authorized.log`, exit 0). No Worker, original example storage or production source was changed. Together with the 38 existing-declaration cases and verified gates, this satisfies this plan's required validation cases; it does not claim an end-to-end historical authentication journey.

## Remaining work

None.
