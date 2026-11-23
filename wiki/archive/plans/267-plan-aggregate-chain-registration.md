# Separate Repo registration from Aggregate catalogue membership

**Status:** Complete, 2026-10-25. Implemented and scoped verification passed.

## Problem and scope

1. `registerRepoWithSystem` reads Aggregate identity through `Reflect.get`, and `SystemRepo.registerRepo` branches on AggregateChain to write catalogue membership. Physical Repo registration consequently carries a second domain responsibility.
2. Every system-bound child, including AggregateChain, should use ordinary `registerRepo`. AggregateChain should explicitly await `registerAggregate` during `onDOActivation`. These operations record different facts and commit separately; their readers require no joint transaction.
3. Preserve [Plan 266](266-plan-independent-contract-version-specs.md)'s factory-derived SystemSpec hash gate, local startup order and accepted snapshot retention. This plan changes registration ownership only. Contract compilation, command admission, replay, session issuance and unrelated work remain outside scope.

## Final contract

1. Simplify the existing `IRepoRegistration` in `core/system/types.ts` to one physical registration shape. Aggregate identity belongs only to the separate membership operation:

   ```ts
   type IRepoRegistration = Readonly<{
     repoType: Exclude<IRepoType, 'SystemRepo'>;
     repoName: string;
     tableNames: readonly string[];
   }>;

   registerRepo(props: {
     registration: IRepoRegistration;
     systemSpecHash: string;
   });

   registerAggregate(props: {
     aggregateName: string;
     aggregateId: IAggregateId;
   });
   ```

2. `SystemRepo.registerRepo` retains `requireAcceptedSystemSpec(db, systemSpecHash)` before its physical metadata upsert by `(repoType, repoName)`. Preserve `system-spec-invalid` for malformed hashes and `system-spec-not-accepted` for unaccepted hashes. It writes only `repos`, including for AggregateChain, and never changes `acceptedSystemSpecs` or `aggregates`.
3. `SystemRepo.registerAggregate` records `(aggregateName, aggregateId)` in `aggregates` with the existing `onConflictDoNothing` behavior. It writes no physical metadata. Validate and destructure its wire identity once in the receiving SystemRepo RPC method, using an inline schema; the sibling typed domain procedure owns the membership insert. Use the existing invocation, error and RPC-envelope conventions.
4. The accepted-hash prerequisite remains in physical registration. The new internal membership operation receives only Aggregate identity and is called after that gated startup. Whole snapshot acceptance continues to own immutable-fact comparisons. Earlier accepted hashes remain usable even when SystemRepo executes another snapshot.
5. `getRepoRegistrations`, table inspection, `getAggregateIds` and `hasAggregate` retain their existing read contracts. Inspection continues to include the intrinsic SystemRepo result.

## Startup and failure behavior

1. Keep `makeMigratableDORepo`'s existing `repoType`, `system`, system-ID validation and SystemRepo registration exemption. It still derives `makeSystemSpec({ system }).hash` and awaits ordinary `registerRepoWithSystem` after derived fields initialize and before local PRAGMA, schema initialization, migrations, bootstrap or activation.
2. Simplify `registerRepoWithSystem` to construct physical metadata and forward the supplied hash. Remove its `key` argument, AggregateChain branch, reflective identity reads and associated defect. Remove the unused `key` argument from its factory invocation.
3. Make the call to `SystemRepo.registerAggregate` the first awaited domain operation of `AggregateChain.onDOActivation`, using `this.key.aggregateName` and `this.key.aggregateId` within `this.key.systemId`. Keep the RPC call and envelope decoding in that existing activation workflow. After membership registration succeeds, continue the existing scheduled-Agent recovery hold, replay enrollment and queue wakeups. The constructor gate opens only after the activation Effect completes.
4. If physical registration fails, local initialization and activation do not run. If membership registration fails, activation fails while the committed physical metadata and completed local initialization remain. The next addressed AggregateChain activation retries both idempotent registrations. This promises no autonomous retry or discovery-driven repair.
5. Between commits, inspection can see physical metadata while `getAgentAggregateIds` omits the Aggregate and Agent selection refuses with `agent-aggregate-not-registered`. Membership may also remain after a later activation step fails. Neither catalogue is evidence of completed activation.
6. Preserve AggregateChain's `initializeAgentNodes` recovery hold and initialization path. `SystemRepo.initializeAgentNodes` can miss an Aggregate while reading the catalogue during the gap; AggregateChain's own recovery path initializes its scheduled Agents after its constructor gate opens. No new recovery mechanism is required.

## Implementation steps

1. Flatten `IRepoRegistration`, simplify the ordinary adapter and remove the unused factory-call argument. Keep all concrete Repo factory configurations and the factory's props/types unchanged.
2. Remove Aggregate membership insertion from `registerRepo`. Keep its accepted-hash check and physical upsert together in the existing method.
3. Add `SystemRepo.registerAggregate` and its sibling domain procedure, expose it in the `SYSTEM_REPO` namespace method pick, and await it directly at the start of AggregateChain activation. Keep each database write synchronous within its own operation; there is no transaction spanning the two RPCs.
4. Adapt the existing lifecycle assertions below. Create no test files, fixtures, runners or configuration.
5. Reconcile the affected SystemRepo/factory READMEs, glossary, lifecycle pattern and AuthoredSystem/SystemApi workflow sections and source citations with the implemented ordering. Preserve archived plans and completed Plan 266 changes.
6. Record verification and archive this plan with Remaining work set to None only after implementation and required checks pass.

## Planned file hierarchy

Paths are rooted at `/Users/morgs32/GitHub/zerospin/`. `+` creates and `~` modifies.

```text
packages/core/src/system/
  ~ types.ts
packages/system-worker/
  src/
    makeMigratableDORepo/
      ~ makeMigratableDORepo.ts (remove unused registration-call key only)
      ~ README.md
    AggregateChain/
      ~ AggregateChain.ts
    SystemRepo/
      ~ SystemRepo.ts
      ~ README.md
      registerRepo/
        ~ registerRepo.ts
        ~ registerRepoWithSystem.ts
        ~ systemRepoNamespaces.ts
      registerAggregate/
        + registerAggregate.ts
  tests/repo-lifecycle/
    ~ repo-lifecycle.workerd.spec.ts
wiki/
  ~ glossary.md
  patterns/system-worker/~ repo-lifecycle.md
  architecture/
    ~ AuthoredSystem.md
    ~ SystemApi.md
```

## Verification

1. Reuse the existing lifecycle registration case. Preserve malformed/unaccepted hash rejection and acceptance-write prohibition assertions. Prove a valid ordinary AggregateChain registration writes physical metadata without inserting Aggregate membership. Repeated physical registration still refreshes table names in one Repo row.
2. Replace the old two-write rollback scenario and SQL abort trigger with an activation failure assertion. At the existing activation seam, make the membership RPC return one representative Failure, capture the actual `AggregateChain.onDOActivation` Effect with `Effect.exit`, and assert that failure propagates. Restore the RPC afterward. Source inspection must confirm that membership registration is awaited before the existing recovery holds and queue wakeups and that the constructor awaits activation.
3. Use an Aggregate identity with no catalogue membership immediately before calling the real `AggregateChain.ready()`. Assert absence through `hasAggregate` or `getAggregateIds`, await `.ready()`, then assert membership appears. This must exercise activation without first calling `registerAggregate` for that identity. Afterward, repeat `registerAggregate` and verify exactly one membership row remains. Cover malformed membership identity at the RPC method and preserve the existing factory-derived hash and native/PartyServer lifecycle assertions.
4. Refresh resolved Nx targets, then run one explicit `lib,ts,lint` graph for Core, System Worker and their Browser/SDK/Dev Worker consumers. Run only the existing lifecycle spec through the backend test target:

   ```sh
   pnpm nx run-many --projects=@zerospin/core,system-worker,@zerospin/browser,@zerospin/sdk,@zerospin/dev-worker --targets=lib,ts,lint
   pnpm nx run zerospin:test -- packages/system-worker/tests/repo-lifecycle/repo-lifecycle.workerd.spec.ts --maxWorkers=2
   ```

5. Finish with scoped formatting, source/citation checks and `git diff --check`. Never verify Explorer. No deployment, browser session or unrelated workspace polish is required.

## Decisions and operational scope

1. Separate the physical registration fact from the Aggregate catalogue fact. The former combined commit already preceded local initialization and never proved activation. Independent idempotent operations express the actual requirements with less coupling.
2. Preserve the post-266 storage schema and SystemSpec format. This plan introduces no additional storage cutover or migration. Plan 266's retained-history/initial whole-snapshot acceptance and empty affected storage requirements still govern a later rollout. Storage reset, publication, consumer dependency reconciliation and deployment remain separately authorized work.

## Implementation and verification results

1. Ordinary physical registration retains the factory-derived whole-SystemSpec hash gate and metadata upsert. AggregateChain awaits the separate idempotent membership RPC first during activation. Wire identity validation stays in SystemRepo; the membership procedure owns its synchronous transaction. No configurable callback, shared upsert helper or compatibility path was added.
2. The planned five-project `lib,ts,lint` graph passed with six dependency tasks (18 tasks total). A final System Worker `ts,lint` graph passed after correcting an introduced import-order warning. Existing unrelated lint warnings remain; Nx Cloud connectivity/access notices did not fail the checks.
3. The scoped lifecycle target compiled the complete existing test program and passed all **10 lifecycle tests**, with no unhandled errors. It proves physical metadata without membership, metadata refresh, malformed/unaccepted hash rejection, no snapshot acceptance writes, malformed membership rejection, membership appearing through real `.ready()`, idempotence and membership RPC failure propagating from the actual activation Effect. The representative mock uses the declared `drizzle-transaction-failed` outcome.
4. The initial test mock used an undeclared failure code; that compiler failure was corrected. The sandbox then prevented the Cloudflare test runtime from binding loopback before tests began. The same scoped command passed with local-runtime access. Nx reported a flaky-task notice after those unsuccessful attempts; no lifecycle assertion failed in the successful runtime run.
5. All nine changed TypeScript files passed scoped `oxfmt --check`. Documentation source hashes and affected citation ranges were refreshed, links checked, and `git diff --check` passed. Independent runtime/test review found no actionable issues. Source inspection confirms hash-gated registration precedes local SQL and the awaited membership RPC precedes recovery holds and queue wakeups.
6. No test files, fixtures, runners, configuration, storage schemas, dependency pins or application storage were created or reset. Explorer was not verified. Publication, consumer dependency reconciliation, operational cutover and deployment remain outside this implementation.

## Remaining work

None.
