# Route administrative commands through canonical retained admission

Status: Implemented and verified in the approved goal on 2026-10-11.

SystemApi resolves current authored contracts and getVersion before calling canonical admission. An exact retained aggregate retry can therefore be refused at this outer API after its current declaration disappears, even though the chain deliberately recovers it without current declaration validation. Service execution additionally awaits the requested outer serviceVersion rather than the receipt's retained serviceVersion; the wrapper version is independent from command.serviceVersion. The admitted receipt is authoritative for result routing.

Source: [aggregate method](../../../packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts), [service method](../../../packages/system-worker/src/SystemApi/executeServiceCommand/executeServiceCommand.ts), [direct execution](../../../packages/system-worker/src/executeDirectAggregateCommand/executeDirectAggregateCommand.ts), [seed consumer](../../../packages/cli/src/seed/seedFn.ts), [Checkout caller](../../../examples/shopping/src/appWorker.ts).

1. Keep outer RPC schema decoding and secret-key capability/system binding. Keep aggregate administrative envelope checks: system origin, nodeId null, public async response absent. The canonical chain owns current contract authority/payload/node continuity and exact retained duplicate matching. Remove redundant current-contract/getVersion checks from SystemApi; do not remove the chain's validation for new commands.
2. Hard-cut redundant outer `aggregateVersion` and `serviceVersion` request fields. Both are already inside the encoded command. SystemApi methods accept `{command}`. Adapt CLI seed serialization and Shopping Checkout caller at the same time; failure capability methods infer signatures from SystemApi and need no hand-maintained legacy overload. Do not provide compatibility aliases or fallback version routing.
3. Service canonical admission checks its own service owner envelope and public async disposition. Preserve existing secret-capability policy for caller values; do not suddenly force caller null or fabricate an authenticated actor from a client descriptor. The route must use receipt.serviceVersion and serviceIndex, proving exactly one receipt with matching ID/service owner and retained occurrence semantics before awaiting. Receipt schema/proof belongs to the canonical admission response; the API does not perform another contract lookup to prove it.
4. Add `executeDirectServiceCommand`, matching the cohesive aggregate direct-execution responsibility: acquire owner chain -> admit one -> require exact receipt -> acquire admitted release/result owner -> await completion. It may be shared by actual internal direct-service callers; do not create a forwarding wrapper if only one meaningful program remains clearer in the API. Use current consolidated VersionRepo journal after its separate merger; no extra result-history DO.

```ts
const executeAggregateCommand = rpcMethod(aggregateCommandBoundary)(function* ([
  { command },
]) {
  const { systemId } = yield* Initialized;
  yield* requireAdministrativeAggregateEnvelope(command);
  return yield* executeDirectAggregateCommand({ systemId, command });
}, commandOutcomeCallbacks);

const executeServiceCommand = rpcMethod(serviceCommandBoundary)(function* ([
  { command },
]) {
  const { systemId } = yield* Initialized;
  return yield* executeDirectServiceCommand({ systemId, command });
}, commandOutcomeCallbacks);

const executeDirectServiceCommand = Effect.fn(function* (
  props: DirectServiceCommand,
) {
  const chain = yield* acquireServiceCommandOwner(props);
  const receipts = yield* admitServiceCommand(chain, props.command);
  const receipt = yield* requireOneServiceReceipt(props.command, receipts);
  const execution = yield* acquireRetainedServiceExecution(
    props.systemId,
    receipt,
  );
  return yield* awaitServiceCommandResult(execution, receipt.serviceIndex);
});
```

Required behavior: new commands still require currently allowed owner/contracts/payloads; exact retained duplicates recover the identical original receipt before current release/actor/contract availability checks, including a release omitted from the deployment; mismatched command ID/input remains refused; one owner's/version's result never awaited using another wrapper version. A body with an encoded public async response remains forbidden. Repeated admin commands are canonical occurrences, not reexecuted on each API request. Receipt recovery does not promise final-result availability after arbitrary historical release removal: an unfinalized original still needs its retained authored release to execute, and VersionRepo activation needs authored model definitions. Await uses the retained receipt version and returns its actual unavailable/failure outcome; it never substitutes today's version. Preserve typed final command failures versus method refusals and full Effect Cause for infrastructure/defects/interruption.

Intentional changes: public request wrapper versions are removed, outer redundant declaration refusals no longer shadow retained recovery, and service completion follows admitted version. Plan121 explicitly owns service duplicate-before-current-declaration receipt recovery; this API plan removes the outer checks that would shadow it. Aggregate outer owner lookup should likewise move to canonical admission if it can block retained recovery; keep only bound ownership/envelope checks that do not consult today's contracts.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/
    ~ SystemApi/executeAggregateCommand/executeAggregateCommand.ts # modify
    ~ SystemApi/executeServiceCommand/executeServiceCommand.ts
    + executeDirectServiceCommand/executeDirectServiceCommand.ts
    ~ repoServices/ServiceVersionRepos.ts # modify only exact await capability if needed
  ~ packages/cli/src/seed/seedFn.ts # modify serialized method requests
  ~ examples/shopping/src/appWorker.ts # modify outer version wrapper
```

Other callers must be rechecked exhaustively with rg before editing; present authored callers are CLI seed and Shopping appWorker. SystemApi failure-capability parameter types derive from the real methods. AggregateVersionRepo.authorizeSession's typed callback encoding is a conversion responsibility and is not blindly deleted as duplicate authority checking; if root/other plan removes its redundant authority lookup, preserve encodePayload and submitted historical version behavior there.

Transactions: each admission is one synchronous canonical owner transaction; API acquisition/admission/await RPC stays outside SQL. An admission commit survives later await transport failure so retry can recover its receipt. Do not combine cross-DO work into a fake atomic transaction. Keep exact native capability lifetimes and envelope error propagation.

Implementation order: settle canonical service receipt schema/result owner after journal merger; implement direct service occurrence execution; remove outer declaration checks/version wrapper; adapt CLI/Shopping consumers; verify retained recovery and route; remove imports and old request types. No new tests/fixtures/runners/config.

Verification: `pnpm nx run-many -p core -t lib,lint,tsc:typecheck` followed by `pnpm nx run-many -p system-worker,@zerospin/cli -t lib,ts,lint`; CLI targets lib,ts,lint were verified through current Nx metadata; Shopping targets ts,lint,build exist, so run `pnpm nx run-many -p shopping -t ts,lint,build` for its changed caller. Existing CLI seed and Shopping Checkout server flow provide exact method calls. Runtime criteria: duplicate after declaration removal, duplicate mismatch, differing submitted versus retained occurrence release, explicit refusal propagation, admission succeeds then await fails/retry recovers, new unavailable contract fails. No runtime cases executed during review. Shopping application-browser verification remains prohibited. There is no system-worker test target or permission to add one.

Postimplementation: update administrative command API docs and occurrence/result glossary using canonical owner admission; a separate ADR is unnecessary if current admission/journal ADR already governs authority. Record the public hard-cut wrapper removal in plan/PR, then archive after callers and verification complete.

## Implementation progress — 2026-10-11

SystemApi administrative methods accept command-only requests and delegate to canonical retained admission without redundant current declaration lookups. executeDirectServiceCommand proves a singleton receipt and awaits its retained release/index. CLI seed and Shopping Checkout callers are adapted to the hard cutover. Worker and consumer source gates pass; the controlled retained-retry and failure cases below remain required.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Verified existing runtime workflow — 2026-10-11

The existing Shopping backend and 12-product CLI seed workflow passed on fresh affected storage using current built outputs. Backend startup accepted the authored System, the seed CLI exited 0, and the existing read-only SystemApi inspection returned 12 products plus 12 `createProduct@1.0.0` final commands at service indices 1–12, all `ZerospinSuccess` with `caller:null`. Evidence: `/tmp/zerospin-goal-shopping-seed-backend.log`, `/tmp/zerospin-goal-shopping-seed-cli.log`, `/tmp/zerospin-goal-shopping-seed-admin.log`. This establishes the actual command-only administrative service caller and ordinary admission/result happy path. It does not establish retained retry: the existing seed module generates new command IDs on each import.

The same seeded backend namespace reopened twice without resetting storage, reseeding or rebuilding. Both warm starts accepted the authored System with POST 200 and no startup error, then supported the existing Studio HTTP workflow. Evidence: `/tmp/zerospin-goal-shopping-studio-backend.log`, `/tmp/zerospin-goal-shopping-studio-overlap-backend.log`. Studio trace-isolation evidence belongs to plan 138; these warm starts do not establish the controlled administrative retry and failure cases.

On another same-store startup, the actual public SystemApi retried retained seed command `cmd_WA5BwLq6cgkzyo3cMBjoI` with the original command-only wire request. It returned the identical finalization, raw payload, owner/release, serviceIndex1 and dispositionHash `19be40e605b843ee9f15e4fc46116bcbe15dc40b212a903f9deb284a1ef0f19f`. The same ID with one leading whitespace byte in its raw payload returned exactly the typed method refusal `service-command-identity-mismatch`, even though the decoded JSON was equal. Both requests left all complete `commands`, `executedCommands`, `product` and `modelOperations` row sets byte-identical, with matching SHA256 values and 12 rows each. The invocation exited0 and created no new command ID, declaration, fixture, file or host binding. This establishes an ordinary service retained retry and duplicate-mismatch refusal propagation through the real API. Retry after declaration removal remains unverified.

The same public API executed ordinary `deleteProduct@1.0.0` for the genuinely absent `prd_seed-13`. Command `cmd_DcLvOWHKI22OY6obCtlt-` returned RPC success containing the typed final-command failure `ZerospinError` with code `operation-row-not-found`, retained in both journals at serviceIndex13 with dispositionHash `d2a26fcc57a9214dcda855ae140b1e5fab970a1c24f254e09b699deffb475905`. The previous twelve seed commands/results and all twelve product/model-operation rows remained byte-identical. A new ordinary request for unavailable `deleteProduct@0.0.0`, command `cmd_1ai19LRyN8RQikQ1HhY0Z`, returned exactly one typed method refusal, `admission-contract-not-found`. That ID was absent from both journals and all four complete row sets remained byte-identical to the post-failure baseline, at13/13/12/12 rows. The actual inline invocation exited0; both calls were terminal, with no new declarations, fixtures, files or host bindings. This establishes service execution-failure propagation separately from pre-admission refusal of a new unavailable contract version.

After the final API checks, all thirteen service journal hashes reproduced the current canonical derivation and all source identities/inputs/finalizations matched their result rows. Guarded SIGINT stopped only the owned Shopping CLI58004 and its workerd58104/58106 processes; the existing Nx runtime exited0 and port3005 was released. Read-only physical SQLite inspection using URI `mode=ro` confirmed13 source commands,13 result commands,12 seed products and12 seed model operations after shutdown. Both complete physical journal row sets matched the last public inspection SHA256 values; the failed delete remained at13 and the unavailable-version ID remained absent. The seed resource IDs and operation indices1–12 persisted. Business timestamp columns have different raw SQLite and decoded public representations, so no cross-format business-row hash identity is claimed.

Original Shopping storage was preserved by same-directory rename to `sys_shopping_20260907_pinned_replicas.before-framework-goal-20261011`, without overwrite or migration. After all four owned backend runs, post-shutdown checks found all69 original files (4,642,350,496 bytes) unchanged in SHA256, size, recorded modification time and mode, with no added or missing files. All four runs exited0 and released port3005; only their generated `dev-config-Pu9pHR`, `dev-config-621Fxz`, `dev-config-s8hP9W` and `dev-config-wLlIWr` directories were removed. All eight pre-existing generated configuration directories remain. No browser verification or new fixtures, runners or authored configuration were used.

The actual TicTacToe administrative API also refused an unchanged genuine retained actor command. Current public journal inspection returned existing `createGame@1.0.0` command `cmd_Q88V-TD0DnfcYPxFAm6nD`, with original human actor provenance, `node_3-MKupQVMVxyT_GOZEFlR`, session `gameSession`, pushIndex1 and exact raw payload bytes. Its owning Table decoded the retained row; the existing `EncodedAggregateCommandSchema` projected only the original wire fields, exactly as the current occurrence reader does, removing journal bookkeeping without changing the input, origin or producer fields. Passing that same command to `SystemApi.executeAggregateCommand({command})` returned one typed method refusal, `system-command-origin-invalid`. The actual inline invocation exited0. Complete source/result journals, model/async operations, delivered outbox, selected resources and projection checkpoint were deeply identical before and after:6 source commands,6 result commands,5 model operations,2 async operations, empty outbox and one game at board `XOXO.....`. The combined seven public row sets shared SHA256 `3ad1fad6674bc6771634039b8a0ef9cf757db04ba5b6cb7ea537181a28823e00`; the checkpoint stayed aggregateIndex6/hash `00a8dbaf65ca3911730dd82bf7ebd0852c26b2ff82584df0d4349ce73cd7c0f0`. This establishes the aggregate administrative actor-envelope refusal before domain execution; it does not isolate a system-origin request carrying a forbidden public async response or establish administrative retained retry. No domain command was repeated or new input constructed. Evidence: `/tmp/zerospin-goal-130-admin-refusal.log`.

That bounded check reused the preserved TicTacToe verification namespace through the existing no-build development command, without reset, clean or reseed. Guarded SIGINT stopped only its owned CLI74868 and Workerd74880/74882 processes, released port3006 and joined the existing Nx runtime at exit0. The sole generated `dev-config-SndFN6` directory was removed. All17 prior generated configuration names, inodes and modification times matched; the protected56-file original storage backup retained exact root/file inodes, sizes, modification times and SHA256 values, with no added or missing files. No production source, declarations, credentials, fixtures, runners or authored configuration were added or altered. Evidence: `/tmp/zerospin-goal-130-admin-refusal-backend.log` and `/tmp/zerospin-goal-130-admin-refusal-cleanup.log`.

### Verified headless administrative refusals — 2026-10-11

The existing public SystemApi and genuine retained native winner were exercised without a new declaration, host binding or runner. `makeCommand` with the actual authored createGame@1.0.0 and `NanoIdFactory`, followed by `encodeCommand` and the canonical encoded schema, produced a new ordinary command ID and valid payload. Its administrative envelope had system origin, null Node/session/push and no response. The actual API refused `cmd_H6pJmB02Rle92blzPenmK` with typed `aggregate-chain-command-invalid`: `Administrative commands cannot use claims-bearing contracts`. This is the current higher admission policy in [validateNewAggregateCommand](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateNewAggregateCommand.ts); the authored guard never ran and no occurrence was retained. It does not establish administrative typed execution failure or retry.

A second production-generated ID, `cmd_l4--d-zNtTCcno0o6Kgsf`, requested unavailable ordinary `createProduct@1.0.0` under that actual game owner and received typed `aggregate-chain-command-invalid`: `Ordinary contract createProduct is unavailable for this origin`. Both new IDs were absent from both journals. A separate request projected genuine retained child `cmd_MPwVxSWVWtA0pbySJ0zOq` through the canonical wire schema, retained its actual response1 and null Node/session/push, and explicitly requested system origin. The public administrative boundary refused the forbidden response with typed `system-command-origin-invalid` before domain execution. No producer response, receipt or capability was fabricated. Evidence: `/tmp/zerospin-goal-130-headless-admin-boundaries.log`.

After each terminal refusal, all eight complete source/result/model/async/outbox/resource/checkpoint/history row sets were identical. Their combined SHA256 was `ea5fd80663fd6c536322f6fbab488560796f2524ff762c827473b4394533c153`:6 source/result/model/history rows,2 async operations, empty outbox, one unchanged `XOO.X...X` resource and public6/hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049`. The public tip did not advance. Read-only physical SQLite inspection after shutdown confirmed the complete prior row sets for all five retained TicTacToe owners and Shopping13/13/12 unchanged. Guarded SIGINT stopped owned CLI23481, esbuild23587 and Workerd23588/23591; Nx session2094 joined exit0. All four inspected ports3005/3006/53020/5555 were released. CLI cleanup removed only its own `dev-config-vnIYnP`; the17 previous configurations and56 protected original files matched exactly in recorded identity, size, modification time and SHA256. Evidence: `/tmp/zerospin-goal-headless-final-stopped-provider-journals.log`, `/tmp/zerospin-goal-headless-tictactoe-cleanup.log`.

### Verified disposable administrative routing and recovery — 2026-10-11

The human explicitly authorized disposable verification fixtures and runners under `/tmp`. The actual isolated Workerd provider uses production declaration factories, Chain admission, VersionRepo execution and the public SystemApi. Claims-free aggregate/service administrative `empty` commands finalized with `empty-success` and no operations; declared `deliberate-business-failure` commands finalized as typed contract failures with no resource change. Exact retries returned the identical final index/hash, and an equal-JSON payload differing by one raw whitespace byte refused the retained identity. Evidence: `/tmp/zerospin-framework-goal-server-qvh4z87h/admin-results.log`.

Genuine release2 commands reached each actual retained release2 result owner. A controlled client transport wrapper first obtained the real completed HTTP response and then discarded it with a transport rejection. The unchanged command recovered its retained result without additional source rows or program/producer work; changing its release to1 refused immutable identity. The service case lost the first new command response. The aggregate case recovered the genuine original from its actual source journal after an initial assertion counted ordinary release1 replay as original reevaluation; that setup assertion is excluded. Ordinary replay into another version legitimately invokes its authored program, and the final retry had zero additional program/producer count. Evidence: `/tmp/zerospin-framework-goal-server-qvh4z87h/admin-response-loss.log` and `admin-response-loss-state.json` in that directory.

A separate controlled direct-caller matrix copied genuine retained Chain SQL rows into actual SQL.js and supplied a current caller System with no releases. Both production direct-execution procedures recovered their unchanged receipts before fresh declaration checks, selected retained release2, and awaited its genuine Workerd result RPC. A controlled await reply loss preserved its exact defect and the subsequent unchanged retry recovered the same result. A controlled owner-acquisition Fail plus cleanup Die retained both reasons. All local source rows and real program/producer counters stayed unchanged across24 assertions. This is bounded current-caller omission and retained-owner routing evidence, rather than an assertion that a changed deployment was installed. Complete historical release omission can leave the result owner unavailable; the procedures retain its release and propagate that actual outcome rather than substituting a current release. Evidence: `/tmp/zerospin-framework-goal-server-qvh4z87h/direct-retained-routing.log`.

## Remaining work

None.
