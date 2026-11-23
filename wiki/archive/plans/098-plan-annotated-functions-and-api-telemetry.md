# Annotated functions and schema-backed RPC APIs

## Summary and status

Replace explicit function-span annotation with `makeFn`, and replace `makeApiHandler` and handwritten API forwarding with a typed, Worker-owned `makeRpcApi` class factory. Each RPC declaration supplies its input schema, domain Effect body, and success/failure conversion. Generated prototype methods own decoding, annotation, telemetry, execution, and outcome construction. Each capability instance provides its retained state through a local `Initialized` service tag.

Status: implemented and verified; archived after the required scoped gates passed. This revision supersedes the earlier explicit-decoding/decode-first lint design in this same plan. The approved shape is a typed class factory with instance service provision, rather than a decorator that adds methods only at runtime.

## Reconciliation with the pasted proposal

1. Retain the portable `makeFn` contract, annotation migration across logger/core/system-worker/browser/studio, intrinsic `makeTx` annotation, authored source locations, bounded/redacted snapshots, and framework-error envelope overloads. These remain useful independently of how RPC methods are declared.
2. Retain the operational requirements: domain Effects use ordinary channels, completed roots are collected before telemetry persistence, persistence failure preserves the domain outcome, defects/interruption keep their existing behavior, linked envelopes and null links remain unchanged, and superseded forwarding/factories/registries are deleted. Preserve the shared runtime’s executor, deployment identity, storage, scoped verification, and post-implementation documentation.
3. Supersede the proposed public `makeApiFn`, handwritten class execution/`Effect.match` methods, injected construction callbacks, and mixed request/context props. The locked-in design is `makeRpcApi` declarations with `schema`, `fn`, `onSuccess`, and `onFailure`, generated Promise-returning prototype methods, and per-instance `Initialized` layers. Retained state is retrieved through Effect services. There is one recognized-failure conversion per declaration, shared by decoding and domain refusals.
4. Supersede decode-first control-flow lint, decorator-only method generation, and the pasted plan number 097. Keep this single active plan 098. Lint enforces declaration coverage and prevents public bypass methods; runtime execution guarantees decode-before-body. This chat's settled design governs wherever the pasted proposal conflicts with it.

## Agreed declaration and initialization shape

1. `makeRpcApi` accepts a stable authored API name and a method record. Each declaration supplies `schema`, `fn`, `onSuccess`, and `onFailure`. Keep existing per-method parse-error mapping, excess-property policy, and telemetry policy explicit in the declaration where they differ. Infer decoded `fn` props from the schema and its domain result/error/service requirements from its body.
2. The factory returns a native class extending `RpcTarget`. Install each declared method on that class's prototype, preserving Cap'n Web method exposure. The subclass inherits precisely typed, Promise-returning public methods; callers never see an Effect return type. Keep implementation helpers private or symbol-named and instance layers private. Traverse declaration records with `mapValues` from `es-toolkit`.
3. Each stateful API owns an `Initialized` tag with an API-qualified service identifier and the retained capability state it actually needs: binding, access, authorization results, system identity, or retained rejection. Use a local same-named module, such as `AggregateAccessApi/Initialized.ts`. Supply an instance layer through `super(Layer.succeed(Initialized, state))`; method bodies read `yield* Initialized`. Do not thread a second context argument through method bodies or rebuild the old mixed `{ request, access, execution }` props container.
4. The base retains and provides the instance layer to every call. Distinct instances may use the same tag with different values; values must never be installed into mutable global context. Retain current Layer/scope ownership: simple initialization values are instance state, while Worker resources remain owned by their existing Worker services.
5. Inference must subtract services actually supplied by the initialization layer and Worker service provision from the declared method requirements. Unsatisfied services remain compile errors. Do not erase requirements to `never`, accept missing services dynamically, or introduce unauthorized casts. The constructor must require the initialization services used by its method record. Stateless APIs need no artificial state or constructor arguments.
6. Public capability success/failure construction belongs to `onSuccess`/`onFailure`. Domain bodies return domain values and use ordinary Effect error channels; they do not instantiate failure capabilities or catch their own parse errors. The same `onFailure` handles recognized input-validation and domain failures. Conversion callbacks are synchronous and typed against the actual domain outcome; callback exceptions are defects, not another recognized refusal.

Illustrative proposed interface; names/types are adapted to current source during implementation:

```ts
// AggregateAccessApi/Initialized.ts
export class Initialized extends Context.Service<
  Initialized,
  { readonly access: IAggregateAccess }
>()('AggregateAccessApi.Initialized') {}

// AggregateAccessApi/authorize/authorize.ts
export const authorize = {
  schema: AggregateSessionRequestSchema,

  fn: function* (request) {
    const { access } = yield* Initialized;
    return yield* authorizeAggregateSession({ request, access });
  },

  onSuccess: authResults => new AggregateSessionApi({ authResults }),

  onFailure: failure => new AggregateSessionApiFailure(failure),
};

// AggregateAccessApi/AggregateAccessApi.ts
export class AggregateAccessApi extends makeRpcApi('AggregateAccessApi', {
  authorize,
}) {
  constructor(access: IAggregateAccess) {
    super(Layer.succeed(Initialized, { access }));
  }
}
```

7. Preserve same-named method folders. Export method declarations from those modules; derive schema/body types through a contextual declaration helper only if needed to preserve inference for separately authored records. Such a helper is typing/declaration machinery inside `makeRpcApi`, not a second executor. Do not type generator inputs as `any` or repeat manual public contracts to compensate for lost inference.
8. Reject the previous alternatives: explicit decode-first bodies require lint to infer raw-input flow; opaque props cannot enforce ordering before unrelated effects; a decorator alone cannot add statically visible Promise-returning methods. The factory concentrates behavior and makes parsing order a runtime invariant.

## Execution, failure, and wire contracts

1. For each invocation, start the annotated named root and collect its envelope around both decoding and domain execution. Decode before invoking `fn`; `fn` receives only the decoded value. For direct-request methods, `schema` describes that request. For existing `IRpcRequest` methods, describe the existing request envelope and argument tuple so the declaration extracts validated domain props without passing raw input to the body. Preserve all current public call shapes, tuple arities, schemas, excess-property policies, and parse-error codes.
2. Keep transport metadata and raw request values inside the generated method implementation. Trace-context handling must follow existing wire and validation policy; it must not provide an alternate path for domain work to inspect unvalidated arguments. Do not invent application metadata fields or add another wire wrapper.
3. Collect the completed root, persist telemetry, then invoke exactly one outcome-conversion callback. Both parse failures and domain refusals reach `onFailure` with the precisely encoded failure union, including existing serialization-failure codes. Success conversion receives the domain success value. Persistent telemetry failure preserves the settled domain outcome; backend-log references appear only after successful persistence.
4. Defects, interruption, and composite Causes retain current behavior and reject rather than become ordinary failure capabilities. Infrastructure failures are not silently classified as props failures. Success/failure construction occurs after root collection and persistence; construction defects still reject.
5. The Worker-owned factory uses the shared runtime’s `config.managedRuntime.runPromise` and existing Worker service provision. API constructors receive capability initialization state, not runners, procedure registries, `createApi` callbacks, or runtime forwarding. Do not put Worker execution dependencies into the portable logger package.
6. Capability-returning methods construct the failure capability matching their return contract. For example, `AggregateAccessApi.authorize` returns `AggregateSessionApi` or `AggregateSessionApiFailure`; it does not return an access failure merely because the receiving class is an access API.
7. Linked-envelope methods retain their existing public `{ result, link }` policy. Reuse current `makeRpcEnvelope`, `persistApiTelemetry`, persisted matching-root link construction, and null-link conditions inside the generated execution path. Keep trace linking and encoded envelope construction internal to that existing outcome policy; do not reduce them to a bare domain-result callback and accidentally drop link context. No new public outcome shape is planned.
8. Preserve the pre-acceptance telemetry persistence opt-out on the existing spec methods. No-payload declarations preserve their current input policy; an `IRpcRequest<[]>` method still receives an envelope. Retained-failure APIs preserve immediate refusal and null-link behavior without decoding, invoking domain work, or generating new telemetry. Their shared implementation is a terminal refusal path, not a second success execution path.

## Portable annotation contracts

1. Export `makeFn(name, spanOptions?)(body, outsideTransform?)` from `@zerospin/logger`. Accept generator and Effect-returning bodies, preserving argument, success, error, requirement, and generic inference.
2. Run annotation inside the named span. Apply the optional transform outside that span so envelope collection includes the completed span. Preserve bounded snapshots, redaction, callable arity, and invocation context. Use this mechanism internally in `makeRpcApi`; no separate public `makeApiFn` executor is needed.
3. Capture authored declaration and invocation locations at the public calls. Generated method frames must not replace the declaration's authored `fn` location. Restore stack frames immutably and use the existing `function.definition` attribute. Instance services and private diagnostic metadata must not enter argument snapshots.
4. Add the framework-error overload to `makeRpcEnvelope`, mirroring `encodeError`: preserve finite error codes, include `error-serialization-failed`, and retain `never` for success-only programs. Keep scoped-error serialization unchanged.
5. Make `makeTx` intrinsically annotated, remove its annotation callback, and preserve transaction execution, synchronous semantics, and authored source locations. Keep low-level annotation implementation private.

## Migration and enforcement

1. Implement the portable `makeFn` and envelope overloads, then the Worker-owned class factory and instance-layer typing. Prove the prototype/caller-type and decode-before-body guarantees on one existing capability seam before migrating all in-scope APIs.
2. Migrate GatewayApi, SystemApi, AggregateApi, ServiceApi, AggregateAccessApi, ServiceAccessApi, AggregateSessionApi, and ServiceSessionApi with their existing callable failure capabilities and Worker entrypoints. Keep deeper authentication, audit, owner/resource authorization, and Repo procedures intact. Do not introduce duplicate wire validation inside Repos.
3. Replace same-named API procedure modules with declaration modules and consolidate the four admission/authorization request helpers into those declarations' schemas and domain bodies. Bodies read retained state through their own API's `Initialized` service. Derive retained encoded failure unions from parsing plus domain Effect errors.
4. Move capability construction into declaration callbacks and delete superseded capability factories, Worker-admission adapters, injected procedure registries, runtime forwarding, and failure procedures that only construct another failure capability. Update the Gateway and Worker entrypoints together; preserve terminal refusal surfaces.
5. Replace all in-scope `makeApiHandler` calls with generated declarations and retain the existing linked-envelope and persistence policies. Move `ApiTelemetry` to its own module, delete the superseded handler directory, and use API-local initialization tags for retained identity instead of keeping `SystemApiAuthResults` solely as a forwarding dependency. Preserve any actual distinct service use found in source rather than inventing a duplicate state concept.
6. Migrate every current annotation site in logger, core, system-worker, browser, and studio to `makeFn`. Capture actual authored arguments and remove redundant outer spans. Preserve concurrent unrelated work.
7. Replace the proposed `rpc-decode-first` lint rule with `zerospin/rpc-declared-methods` in the existing custom Oxlint plugin. For the in-scope generated API subclasses, prohibit handwritten public prototype methods/getters that bypass the declaration record. Allow constructors, private/symbol implementation members, and explicitly identified existing lifecycle/terminal-refusal members. Verify actual Cap'n Web-reachable surfaces, including inherited members; do not rely on TypeScript `private` to hide a method.
8. Lint checks declaration usage and bypasses, not arbitrary decode control flow across files. The factory must fail declaration setup for missing schemas on payload-bearing methods, malformed declarations, or method collisions rather than silently expose an unvalidated method. No props-cloaking types, decorators, generated-source build step, Cap'n Web validation dependency, compatibility aliases, or parallel parsing paths are planned.

## Planned files

Legend: `+` create, `~` modify, `-` delete. Shared documentation changes only after implementation establishes the result.

```text
zerospin/
├─ packages/logger/src/
│  ├─ + makeFn.ts
│  └─ ~ annotation implementation, envelope overloads, exports
├─ packages/system-worker/src/
│  ├─ + makeRpcApi/makeRpcApi.ts
│  ├─ + ApiTelemetry/ApiTelemetry.ts
│  ├─ ~ GatewayApi/, SystemApi/, AggregateApi/, ServiceApi/
│  ├─ ~ AggregateAccessApi/, ServiceAccessApi/
│  ├─ ~ AggregateSessionApi/, ServiceSessionApi/
│  │     + API-local Initialized.ts where retained state is required
│  │     ~ same-named method modules and retained-failure capabilities
│  ├─ ~ Worker entrypoints, repoServices, persistence integration
│  └─ - makeApiHandler/, superseded factories/adapters/forwarding
├─ packages/{core,browser,studio}/src/
│  └─ ~ annotation callers
├─ scripts/lint/
│  └─ ~ zerospin-plugin.mjs
├─ ~ .oxlintrc.json
└─ wiki/
   ├─ ~ archive/plans/098-plan-annotated-functions-and-api-telemetry.md
   └─ ~ affected RPC/function patterns, architecture, glossary
```

## Verification and documentation

1. Reconfirm relevant Nx configurations once at implementation time and run the existing scoped gates:

   ```sh
   pnpm nx run-many -t lib lint -p @zerospin/logger,@zerospin/core,system-worker,@zerospin/browser,@zerospin/studio
   pnpm nx run-many -t ts -p @zerospin/logger,system-worker,@zerospin/browser,@zerospin/studio
   ```

2. Verify inference through existing typecheck seams or transient compiler input, without creating test/typecheck fixture/runner files. Check schema-inferred caller props and decoded body inputs, Promise-returning inherited methods, exact success/failure capability unions, parse-error inclusion, generator and Effect-returning bodies, required initialization services, and rejection of missing remaining services. Do not use unauthorized casts to make the interface appear sound.
3. Exercise built helpers directly through existing execution/RPC seams without adding test, fixture, runner, or verification configuration files. A malformed request must collect its parsing failure, call no domain body or Repo, and invoke `onFailure` once. A valid refusal takes that same callback; success invokes only `onSuccess`. Defects, interruption, callback exceptions, and existing composite-Cause behavior must retain rejection semantics.
4. Use two capability instances with distinct values for the same `Initialized` tag, including concurrent calls. Verify each body sees its own retained state and that private state, layers, and execution helpers are inaccessible over RPC. Exercise actual Cap'n Web dispatch to generated prototype methods and capabilities returned by conversion callbacks, not just direct JavaScript calls.
5. Verify successful and failed persistence, completed-root collection, redaction, authored declaration/invocation locations, backend-log references, pre-acceptance persistence opt-out, linked-envelope wire results, persisted-root trace links, null links, no-payload methods, and terminal refusal capabilities. Preserve transaction semantics.
6. Evaluate lint with in-memory source or existing lint APIs. Generated API subclasses with declaration records pass; handwritten public bypass methods/getters and TypeScript-only private helpers fail. Inspect every in-scope callable method for migration coverage. Confirm no `makeApiHandler` or duplicate public API executor remains.
7. After implementation, reconcile local RPC/function patterns with schema-backed generated methods and instance services. Update affected identity workflows and glossary terms from the actual implementation. Create an ADR only if the implemented choice satisfies the repository's qualifying criteria. Archive this plan only when migration, required verification, and documentation are complete.

## Dependencies and scope

1. Build on the shared runtime’s `config.managedRuntime.runPromise` interface; do not duplicate its executor or retain a runtime fallback.
2. Preserve current deployment identity from `env.ZEROSPIN_SYSTEM_ID`, existing wire formats, schema policies, storage, transaction ownership, and unrelated WIP. No fixed-storage schema change or storage migration is planned.
3. Only the listed API family and annotation callers are in scope. Unrelated RPC owners and deeper internal procedures do not receive a new factory or redundant parsing requirement. Initially support the framework failures needed by current methods; add no arbitrary serialization policy, compatibility support, or unauthorized casts.
4. The implementation request authorizes this plan end to end. No new test files, fixtures, runners, or verification configuration are authorized.

## Implemented result and verification

- Added portable `makeFn`, including generator/Effect bodies, generic inference, dynamic or bound `this`, callable arity, authored source frames, bounded redaction, and an outside transform after span completion. `makeTx` now annotates itself; the low-level annotation helper is absent from the public logger exports.
- Added the Worker-owned `makeRpcApi` and contextual `rpcMethod` declarations. All eight capability families now use generated Promise-returning prototype methods and private per-instance initialization layers. Schemas decode before domain work; one callback converts the settled outcome after best-effort persistence. The factory follows the current shared Worker executor (`config.managedRuntime.runPromise`), supplied by concurrent plan 100.
- Removed superseded handlers, admission adapters, injected procedure registries, forwarding-only failure procedures, and explicit annotation callers. Existing wire shapes, nested parse-error policies, linked envelopes, immediate refusals, and pre-acceptance persistence opt-outs remain intact. Added declaration-coverage lint and reconciled local patterns, glossary terms, and affected workflow diagrams.
- Final scoped lib/lint gates passed for logger, core, system-worker, browser, and Studio; scoped ts gates passed for logger, system-worker, browser, and Studio. Development and production Worker lib/lint gates also passed. Existing unrelated lint warnings remain; Nx Cloud reported an access 401 without blocking local success. In-memory type assertions finished with zero diagnostics and covered encoded/decoded schema inference, exact Promise outcome/error unions, generator/Effect bodies, generic functions, success-only envelope errors, required initialization, and missing remaining services.
- Runtime probes passed decode-before-body, callback counts, concurrent instance isolation, completed roots, redaction, authored source locations, persistence success/failure, backend references, opt-outs, trace links/null links, terminal refusals, rejection of defects/interruption/composite Causes and callback exceptions, malformed declarations, and inherited bypasses. Actual Cap'n Web prototype dispatch and returned capabilities passed with injected Worker service seams; no deployed Worker test was claimed. Transaction probes passed commit, refusal rollback, explicit rollback, and cancellation of suspended work.
- Eleven in-memory lint cases passed, including public methods/getters, TypeScript-only private members, inherited bypasses, initialization parameter fields, allowed native-private/symbol helpers, and the explicit terminal refusal whitelist. Fresh runtime probes passed against the current shared executor. No test, fixture, runner, or verification configuration files were added.
- Final gates were rerun successfully after concurrent shared-runtime/composition fixes. Affected workflow source inventories were refreshed against the verified source; `git diff --check` passed. The implementation introduces no storage schema changes or qualifying irreversible ADR decision.

## Remaining work

None.
