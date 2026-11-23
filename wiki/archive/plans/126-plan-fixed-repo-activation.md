# Bind every fixed Repo to its configured system before activation

Status: Implemented and verified in the approved goal on 2026-10-11.

`makeFixedDORepo` checks configured systemId only for AggregateChain, infers version ownership from the existence of object fields, and later registers every other Repo against `env.ZEROSPIN_SYSTEM_ID`. A path for another system can therefore pass the generic validation branch and register a different system's physical object with this deployment's SystemRepo. Identity validation belongs before registration/provision/bootstrap; all fixed Repo identities need the same system binding proof.

Source: [fixed activation](../../../packages/system-worker/src/makeFixedDORepo/makeFixedDORepo.ts), [configuration types](../../../packages/system-worker/src/makeFixedDORepo/types.ts), [base activation](../../../packages/system-worker/src/makeDORepo/makeDORepo.ts), [registration](../../../packages/system-worker/src/SystemRepo/registerRepo/registerRepo.ts).

1. Use the declared fixed Repo kind and decoded key to validate its explicit domain identity. Every fixed Repo, including the system-scoped SystemRepo and SystemLogRepo, must belong to the configured system. A parent constructor-specific check is not a substitute for a consistent base lifecycle rule. Check system binding before loading database configuration, registration, schema SQL or authored bootstrap. Preserve synchronous validation where metadata is synchronous.
2. Resolve version availability according to declared Repo kind: aggregate release for aggregate-version/projection/result identities and service release for service-version/view/result identities need authored models to activate. Versionless AggregateChain/ServiceChain have static storage and currently permit activation with an empty deployed registry. Preserve that behavior: configured-system/key binding applies, but current owner/release presence must not shadow retained receipt recovery under Plans121/130. New command IDs still require current authored owner/release authority at admission. Never reconstruct executable declarations from the accepted catalogue. Preserve exact actor/agent tuple checks currently owned by their constructors/configuration. Do not create a runtime policy registry or infer identity from arbitrary `'aggregateVersion' in key` tests. The type surface should make the fixed kind and the fields that kind requires agree at construction.
3. Extract one cohesive `validateFixedRepoIdentity` procedure and one `registerFixedRepo` procedure from the inline factory callbacks. The latter builds the typed registration, accepted authored SystemSpec, and remote registration call. Only SystemRepo is exempt from self-registration, as its current configuration omits repoType. SystemLogRepo currently declares repoType: 'SystemLogRepo' and registers in SystemRepo; retain that registration after enforcing its configured systemId. System-scoped physical identity does not imply registration exemption. All other kinds have an exhaustive registration disposition. Avoid the current accidental rule where omitting repoType silently turns any future Repo into a singleton exemption.
4. Keep provision-once policy tiny and inline or named as today; the meaningful lifecycle is validate configured system/key -> check already-accepted definitions and register -> provision -> bootstrap -> mark -> activation hook. Do not move pure identity validation into registration or after SQL. Do not reimplement migratable Repo behavior or add a migration to fixed schemas.

```ts
const admitFixedRepo = Effect.fn(function* (props: FixedRepoAdmission) {
  yield* validateFixedRepoIdentity(props.identity, props.system);
  if (props.identity.kind === 'SystemRepo') return;
  const registration = makeFixedRepoRegistration(props.identity, props.schema);
  const spec = yield* getSystemSpec();
  yield* registerAcceptedRepo(props.systemId, spec, registration);
});

const makeFixedDORepo = (BaseClass: FixedBase, props: FixedConfiguration) => {
  const initializeSchema = Effect.fn(function* (state: FixedSchemaState) {
    if (state.isBootstrapped) return;
    yield* provisionDb({ db: state.db, schema: state.schema });
  });
  return makeDORepo(BaseClass, {
    ...props,
    validateKey: key =>
      validateFixedRepoIdentity(bindFixedRepoIdentity(props, key)),
    registerRepo: state =>
      registerFixedRepo(bindFixedRepoIdentity(props, state.key), state),
    initializeSchema,
  });
};
```

Schematic types above stand for the existing generic parameters plus a discriminated declaration of fixed identity; do not weaken them to any/unknown or add ALLOWED_CAST. `bindFixedRepoIdentity` may be unnecessary if exact typed configurations can pass their values directly. An exhaustive switch on Repo kind is preferable to a second dispatch metadata framework. Derive physical name once through the current codec, not an independent identity string. Plan086 owns codec escaping/empty/dot components.

Transactions/lifetimes: validation runs synchronously before registration; accepted-spec registration is a remote capability call outside local SQL. `blockConcurrencyWhile` continues to gate readiness through registration, provisioning, bootstrap and marker. Constructor failures, unavailable definitions and registration failures prevent SQL/bootstrap/marker. A successful marker suppresses provisioning on reactivation but never suppresses system binding or accepted-definition checks. Base migration ledger/rollback/finalizer behavior is unchanged. Current makeTx preserves full Causes after rollback; no wrapper may turn defects/interruption into ordinary registration failures.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    ~ makeFixedDORepo/makeFixedDORepo.ts
    ~ makeFixedDORepo/types.ts # modify explicit fixed identity policy
    ~ makeFixedDORepo/makeFixedDORepoConfig.ts # modify typed construction
    + makeFixedDORepo/validateFixedRepoIdentity.ts
    + makeFixedDORepo/registerFixedRepo.ts
    ~ makeDORepo/makeDORepo.ts # modify only lifecycle signature if necessary
    ~ SystemRepo/SystemRepo.ts # modify explicit singleton configuration
    ~ SystemLogRepo/SystemLogRepo.ts # modify system-scoped kind; preserve SystemRepo registration
    ~ AggregateChain/aggregateChainFixedDORepoConfig.ts
    ~ ServiceChain/serviceChainFixedDORepoConfig.ts
    ~ AggregateVersionRepo/AggregateVersionRepo.ts # modify embedded configuration
    ~ ServiceVersionRepo/serviceVersionRepoFixedDORepoConfig.ts # modify
    - AggregateVersionChain/aggregateVersionChainFixedDORepoConfig.ts # deletion belongs to Plan118; no fixed policy retained here
    - ServiceVersionChain/serviceVersionChainFixedDORepoConfig.ts # deletion belongs to Plan118
    - AggregateActorVersionRepo/aggregateActorVersionRepoFixedDORepoConfig.ts # deletion belongs to Plan119
    - AggregateAgentVersionRepo/aggregateAgentVersionRepoFixedDORepoConfig.ts # deletion belongs to Plan119
    - ServiceActorVersionRepo/serviceActorVersionRepoFixedDORepoConfig.ts # deletion belongs to Plan119
    ~ AggregateActorVersionChain/aggregateActorVersionChainFixedDORepoConfig.ts # surviving selected owner after Plan119
    ~ AggregateAgentVersionChain/aggregateAgentVersionChainFixedDORepoConfig.ts # surviving selected owner after Plan119
    ~ ServiceActorVersionChain/ServiceActorVersionChain.ts # surviving selected owner embedded fixed configuration
```

Affected constructors are the exact configuration paths above and their same-module classes; exhaustive `rg 'makeFixedDORepo|makeFixedDORepoConfig' packages/system-worker/src` supplied this inventory. Recheck after owner consolidation settles and remove deleted identities from the final type union. No unrelated model schema changes are implied.

Implementation order: enumerate surviving kinds/callers; settle discriminated configured identity types; introduce common binding validation before SQL; introduce explicit singleton registration policy; adapt existing configurations; delete structural inference branches and duplicate subclass checks only when their exact semantic coverage is proved. No compatibility alias or fallback kind detection.

Verification: `pnpm nx run-many -p system-worker -t lib,ts,lint` plus current worker type/lib gates when namespace/config type surface changes. Use existing real DO activation seams to demonstrate another systemId fails before registration/bootstrap, missing release fails, valid identity registers, first activation provisions/bootstrap once, repeated activation checks identity without repeated bootstrap, registration refusal leaves no marker. Runtime criteria were not exercised by the review; no current system-worker test target exists, and no test/fixture/runner/config may be created. A typecheck alone cannot prove pre-SQL order.

Postimplementation: update fixed Repo lifecycle README and identity/ownership pattern citations. A new ADR is needed only if explicit fixed Repo identity policy is a qualifying ownership decision not already governed; otherwise update the current governing lifecycle ADR. Archive after every surviving fixed constructor and verification passes.

## Implementation progress — 2026-10-11

Fixed Repo configurations require explicit Repo kind and typed physical identity construction. Configured system/owner identity checks occur before database resolution. SystemRepo is exempt from self-registration; other registration resolves the accepted catalogue outside local SQL. Surviving identities and namespace exports replace deleted owners directly. Worker library compilation passes; physical mismatch and circular-acquisition runtime cases remain unrun.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Verified ordinary registration — 2026-10-11

Fresh current-schema native and Shopping startup successfully activate and register their configured surviving owners. Actual SystemApi inspection returns the native AggregateActorVersionChain's exact aggregate identity, human actor/version and encoded account/instance actorPath; the existing physical name codec reproduces the registration and decodes all seven identity fields ([Plan125](125-plan-websocket-tickets.md)). Actual retained aggregate/service commands and results corroborate the exercised Chain/VersionRepo owners. This establishes ordinary valid registration for those workflows, without observing bootstrap invocation counts or injecting an identity/refusal condition.

### Authorized actual Durable Object lifecycle matrix — 2026-10-11

The human authorized isolated temporary fixtures. `/tmp/zerospin-framework-goal-server-qvh4z87h/lifecycle.log` passes against actual Workerd owners, with temporary bundle observations immediately before the production lifecycle steps. Foreign configured-system names refuse across SystemRepo and all seven surviving aggregate/service input, result and selected owner kinds. Each refused attempt records only identity validation: no database configuration, registration, SQL, bootstrap or marker. Root independently completes SystemLogRepo using its actual name constructor on a separate isolated Worker (`/tmp/zerospin-framework-goal-service-120/log-repo.log`, exit0), likewise observing identity only. All nine surviving fixed kinds are covered; neither fixture changes the common validator.

Unavailable aggregate/service release identities also refuse before database configuration. A fresh valid AggregateChain records identity → database configuration → accepted registration → SQL → bootstrap → marker → activation; its real state reports the marker. Repeated calls and an observed subsequent real activation retain exactly one bootstrap/marker while identity, registration and activation repeat. A targeted SQLite trigger in the actual SystemRepo rejects only the fixture's new physical AggregateChain registration. Its constructor records identity/configuration/registration and no local SQL/bootstrap/marker; the registration table remains empty for that name. The trigger is removed in `finally`. Earlier fixture assertions expected a domain code in a thrown message and exposed nested trigger text through Drizzle; those assertion expectations were corrected and are not product defects. Marker absence is bounded by observing the unchanged production marker write rather than inspecting a failed constructor instance. Original TicTacToe/Shopping resources are untouched.

## Remaining work

None.
