# Retain accepted authored definitions in one immutable catalogue

Status: Implemented and verified in the approved goal on 2026-10-11.

SystemRepo has five tables and five near-identical acceptance programs for immutable authored version definitions. registerRepo repeats kind-specific lookup/decode/compare traversals of the incoming SystemSpec. The domain is one promise: once an identity's authored definition is accepted, that exact definition cannot change, including actor versions reused across releases. A typed immutable catalogue can express that promise once while retaining the distinct identities.

Source: [tables](../../../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts), [acceptance parent](../../../packages/system-worker/src/SystemRepo/acceptSystemSpec/acceptSystemSpec.ts), [registration](../../../packages/system-worker/src/SystemRepo/registerRepo/registerRepo.ts), [exact mismatch diagnostic](../../../packages/system-worker/src/SystemRepo/assertAcceptedSpec/assertAcceptedSpec.ts).

1. Replace lockedAggregateVersions/lockedServiceVersions/lockedAgentVersions/lockedAggregateActorVersions/lockedServiceActorVersions with one `acceptedDefinitions` table. Each row is a tagged immutable authored definition with kind `aggregateRelease`, `serviceRelease`, `aggregateActor`, `serviceActor` or `agent`, exact typed identity and spec. Define one canonical tuple key from that identity, encoded by a fixed tuple codec that safely includes opaque strings; no delimiter splitting or ad hoc string join. The row codec validates that its indexed key equals the key of its retained identity, and its spec's identity matches that branch. Kind is not a loose metadata tag over arbitrary JSON.
2. Owner release identities are owner name/version; actor identities are owner kind/name plus actor name/version, intentionally independent of release version. Agent identities are agent name/version. Do not drop actor immutability across separate owner releases just because release specs embed actors. Existing full release specs and agent specs remain accepted, so all nonactor authored details retain their lock too.
3. Flatten the exact finite list of catalogue entries from already decoded ISystemSpec owner/actor/agent fields. These receiver methods do not possess authored executable declarations: Plan106's projectModelSpec/projectContractSpec and owner projectors run once at the producer export boundary, never again here. projectAcceptedDefinitionEntries only pairs each decoded spec field with its exact typed identity; it does not rebuild model/contract metadata or callbacks. Current authored registries/callback object identities remain the runtime execution source. Traverse records with mapValues. No catalogue framework, pluggable resolver or normalized executable binding graph.
4. Accept the complete supplied list in one synchronous transaction: lookup exact key, decode retained typed row, compare exact spec through existing assertAcceptedSpec/JsonPatch diagnostics, otherwise insert. An entry mismatch rolls back every newly inserted entry in the batch. Removed deployed definitions do not delete accepted rows. Equal reacceptance is idempotent and concurrent activation cannot bypass acceptance.
5. Register a Repo by validating that every supplied authored entry already has an equal accepted row, then atomically upsert Repo registration and the special AggregateChain aggregate identity. Reuse the same typed entry/read/compare procedures; registration must never accept a new definition implicitly. Accepted rows are immutable, so read comparison may remain outside the registration write transaction if the source promise is enforced; do not add async RPC inside that write transaction.

```ts
const acceptSystemSpec = Effect.fn(function* (spec: ISystemSpec) {
  const entries = projectAcceptedDefinitionEntries(spec);
  yield* acceptDefinitionEntriesTx(entries);
});

const acceptDefinitionEntriesTx = makeTx('SystemRepo.acceptDefinitionsTx')(
  function* (
    tx: AcceptedDefinitionsTx,
    entries: readonly AcceptedDefinition[],
  ) {
    for (const entry of entries) {
      const retained = yield* readAcceptedDefinition(tx, entry.identity);
      if (retained === undefined) yield* insertAcceptedDefinition(tx, entry);
      else yield* assertAcceptedDefinition(retained, entry);
    }
  },
);

const registerRepo = Effect.fn(function* (props: RepoRegistrationRequest) {
  const entries = projectAcceptedDefinitionEntries(props.spec);
  yield* requireAcceptedDefinitionEntries(entries);
  yield* registerRepoIdentityTx(props.registration);
});
```

Flattening and key/row codecs are total deterministic functions over already decoded serialized specs. read/insert helpers own actual catalogue SQL plus decode; they must not simply hide five remaining switch-specific table accesses. assertAcceptedSpec retains path-sensitive extra/cause diagnostics. The new table is the actual deletion of machinery: five tables, five acceptance utilities and repeated lookup/decode blocks in registerRepo go away, not move into a giant generic helper.

Required observable behavior: a changed actor version fails even when embedded in a newly named release; same version identity cannot mutate; exact reacceptance succeeds; all input entries are accepted or none newly inserted; accepted definitions survive later deployments that omit them; unaccepted Repo registration is refused; accepted Repo upsert and AggregateChain identity listing remain atomic. The catalogue stores comparison specs, never executable callbacks. Current makeTx preserves full Cause after rollback and prevents suspended authored work from writing; no new broad catch normalizes defects/interruption into mismatch.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/SystemRepo/
    ~ systemRepoDbConfig.ts # modify five lock tables -> one catalogue
    + acceptedDefinitions/AcceptedDefinitionSchema.ts # create exact tagged identities/specs/key codec
    + acceptedDefinitions/projectAcceptedDefinitionEntries.ts # create flatten decoded spec fields only
    + acceptedDefinitions/readAcceptedDefinition.ts
    + acceptedDefinitions/acceptDefinitionEntriesTx.ts
    + acceptedDefinitions/requireAcceptedDefinitionEntries.ts # create
    ~ acceptSystemSpec/acceptSystemSpec.ts
    - acceptSystemSpec/utils/acceptAgentVersions.ts
    - acceptSystemSpec/utils/acceptAggregateActorVersions.ts # delete
    - acceptSystemSpec/utils/acceptAggregateVersions.ts
    - acceptSystemSpec/utils/acceptServiceActorVersions.ts
    - acceptSystemSpec/utils/acceptServiceVersions.ts
    ~ registerRepo/registerRepo.ts
    ~ assertAcceptedSpec/assertAcceptedSpec.ts # modify only typed diagnostic paths
```

Affected callers remain SystemApi.acceptSystemSpec/initialize and fixed Repo registration; public SystemSpec wire shape stays. Explorer table names deliberately hard-cut to acceptedDefinitions, so CLI/Studio explorer options derived from registered tableNames naturally change. Check any fixed strings in those real callers before implementation. No migration/old table readers or compatibility-only tests.

Implementation order: Plan106 producer manifest lineage fix; settle typed catalogue identity/key codec; hard-cut schema; introduce batch acceptance/read/compare; replace registration duplicate loops; delete old utilities; update explorer/documentation references; use empty storage and existing gates. This can land independently from session tickets even though both modify SystemRepo schema; integrate one final schema edit sequentially.

Verification: `pnpm nx run-many -p core -t lib,lint,tsc:typecheck` followed by `pnpm nx run-many -p system-worker -t lib,ts,lint` with normal dependencies/cache. Existing SystemApi.initialize/acceptSystemSpec and fixed Repo activation supply runtime seams. Required scenarios are exact repeat, changed actor across release, changed owner/agent spec, late batch mismatch rollback, new unaccepted registration refusal, removed definition retained, registration+aggregate identity atomicity. Runtime scenarios unrun in this review; current system-worker has no test target and no permission exists to create fixtures/runners/configuration. Use fresh isolated fixed storage; compile/lint cannot establish durable immutability.

Postimplementation: update accepted definition/version glossary, SystemRepo tables/workflow citations and one governing immutability ADR to the catalogue model; supersede any table-specific ADR only where no old ownership promise remains. Archive after all old table/caller references and required verification are complete.

## Verified source and existing runtime — 2026-10-11

Final root-coordinated verification passed the fourteen-project library, TypeScript and lint graph with zero source warnings (`/tmp/zerospin-goal-quality-8.log`), native/Shopping/Tic-tac-toe build/type/lint gates (`/tmp/zerospin-goal-consumers-5.log`) and the actual core `tsc:typecheck` (`/tmp/zerospin-goal-core-typecheck-5.log`). The latter used `--skipSync` for existing Nx project-reference synchronization drift. These final gates include the Plan109 native reopen repair. Scoped source formatting and lint passed with zero warnings/errors. No production references to the five removed table names or acceptance programs remain.

The actual Tic-tac-toe backend accepted its executing system, and two same-store Shopping warm starts likewise accepted their existing bundle. The exact equal-repeat case was then checked through the real Tic-tac-toe SystemApi on port3006: read its registered SystemRepo `acceptedDefinitions` rows, invoke `acceptSystemSpec()` once with no arguments, and read the same catalogue again. The RPC returns Success with void result. Both reads contain two rows with two unique keys; complete key/definition row sets are byte-identical after sorting by key, with zero added, removed or changed entries. Their SHA256 is `8335813b79f167a1c80b8ce040f954ee6ef2f3b090d8b6923cb86878aab1fa60`. No new files, fixtures, configuration, builds, mutated definitions or storage reset were used. This establishes equal-repeat idempotence through the durable owner.

### Authorized controlled catalogue verification — 2026-10-11

The human subsequently authorized disposable verification fixtures under `/tmp`. `/tmp/zerospin-framework-goal-server-qvh4z87h/catalogue.ts` runs the production `projectAcceptedDefinitionEntries`, `acceptDefinitionEntriesTx` and `registerRepo` against the actual SystemRepo schema on SQL.js. All declarations originate from current production factories. Nine entries spanning two aggregate releases, two service releases and an agent retain seven rows because the two releases reuse each exact actor identity independently of owner version. Exact reacceptance leaves the complete row set unchanged.

A changed owner spec and changed agent spec are refused with their exact mismatch codes. A batch that first inserts a new owner release and then supplies a changed retained agent rolls back the new prefix. A separate batch inserts that new owner release before changing the reused aggregate actor's identity pattern; `actor-spec-mismatch` likewise rolls back the complete batch. Accepting a later list that omits previously accepted entries leaves every retained definition unchanged.

Registration with an unaccepted release returns `aggregate-spec-not-accepted`, leaving both Repo registrations and AggregateChain identity rows empty. An explicit verification-only SQLite trigger raises a statement fault during aggregate identity insertion, after the registration write; the production transaction rolls both writes back. Removing only that trigger allows registration. Repeating the accepted registration updates its metadata while retaining exactly one registration and one aggregate identity. The runner exits0 with seven accepted rows, one Repo and one aggregate (`/tmp/zerospin-framework-goal-server-qvh4z87h/catalogue.log`). This proves the controlled acceptance and registration transactions on real SQL; the earlier ordinary Workerd catalogue reads establish durable equal-repeat behavior. No original application storage is modified.

The complete catalogue matrix passed again after the shared synchronous cancellation repair (`catalogue.log`, exit0). The final focused five-project library/type/lint graph passes 20 tasks, and the actual core typecheck passes four tasks. No catalogue source or durable immutability criterion remains unresolved.

## Remaining work

None.
