# 069 — RPC call-stack cleanup loop

Status: Archived on 2026-10-11 at the user's explicit request. Completed implementation and verification remain recorded below. The old method-by-method review loop is closed; continuing implementation belongs to the plans linked by the [complete framework review](../../reviews/2026-10-11-framework-rearchitecture.md#plans-and-ownership).

## Summary

This plan reviewed and simplified RPC methods and their reachable call stacks. Iterations 1–6 record the completed changes and their verification evidence. The bounded schema/props batch in Iteration 6 is complete.

The [2026-10-11 complete framework review](../../reviews/2026-10-11-framework-rearchitecture.md) covers the remaining source-review queue. Its ownership proposals retain their own implementation and verification requirements. Archival does not mark those proposals or separately scoped QRK migration/publication complete.

The workflow and iteration instructions below are historical. This document no longer schedules another RPC method review or implementation iteration.

Plan 071 and its handoff were consolidated here on 2026-10-08 and archived as superseded. Their former instructions to keep this work separate no longer apply. The consolidated browser direct-command proposals were replaced by backend authorization-owned provisioning. Completed [Plan 070](070-plan-required-aggregate-authentication.md) remains archived.

## Repeatable loop

1. **Select one method.** Use the method I name. Otherwise, identify framework RPC methods from current source, maintain a pending list ordered by owner and method name, and select the first unreviewed entry. Inspect capability declarations and their implementations directly; Explorer's RPC browsing feature was removed on 2026-10-10. Its authored architecture trees remain explanatory source references.

2. **Trace its behavior.** Read the entrypoint, nested methods, predicates, factories, and relevant callers. Map validation, authority, state reads, transactions, mutations, failures, and returned capabilities. Include deferred callbacks and remote boundaries. Follow workspace implementations until their responsibilities are understood; mark external or unresolved calls explicitly.

3. **Review every name.** Does it accurately describe the operation and return value? Does it suggest authentication, freshness, settlement, or lifecycle behavior it does not perform? Identify overlapping names, vague orchestration helpers, and wrappers that add no meaningful responsibility.

4. **Review every conditional throughout the call stack.** Explain what it checks, where its inputs originate, why each outcome can occur, and the concrete failure it prevents. Determine whether it is necessary, redundant, impossible under established guarantees, or stale. Identify its correct owner and execution point.

5. **Question the machinery and model.** Look for repeated lookups, fabricated registries or identities, echoed context, duplicate state, obsolete policy branches, and mismatched helper interfaces. Separate the required invariant from its current implementation. Prefer removing unnecessary concepts over renaming them or adding another layer.

6. **Present findings and discuss.** Provide a short behavior summary, call map, and prioritized source-linked findings. For each finding, recommend keeping, removing, moving, or simplifying it; explain consequences and show small before/after snippets where useful. Resolve material design choices with me before editing. A clean method may conclude with “reviewed; no changes justified.”

7. **Implement the agreed slice.** Express the workflow as a clear ordered composition. Use precise domain names, narrow inputs, and suitable existing helpers. Put guarantees with their owner. Normalize legitimate optional behavior at construction where appropriate. Delete superseded paths and update affected callers directly.

8. **Verify and document.** Run appropriate scoped checks, inspect the diff, and reconcile affected documentation with the implemented result. Record evidence and remaining work.

9. **Close the iteration.** Report what became clearer and any deliberately retained complexity. Mark the method complete only when its required verification is finished. Stop for review before selecting the next method.

## Refactoring rules

1. Use schemas for data validation and meaningful shape distinctions. Use ordinary predicates for presence, equality, membership, and identity. Use `Match` only when it improves readability or narrowing; retain clear guard clauses.
2. Preserve required authority, ordering, branch laziness, error behavior, synchronous transactions, lifecycle fences, and type inference. Explain any proposed behavior change explicitly.
3. Verify dependencies rather than assuming historical machinery must survive. Equally, do not remove a check merely because it resembles another check across a different trust boundary or state transition.
4. Inspect beyond the selected file, but keep implementation bounded to the agreed call-stack cleanup and necessary callers. Discuss broader ownership or public-interface changes before including them.
5. Follow the hard cutover policy: remove superseded interfaces without aliases or dual paths. Changed fixed schemas require empty storage; do not erase existing storage without authorization. Preserve unrelated work.

## Verification and progress

1. Choose checks from the actual behavior changed: branch outcomes, validation order, denial reasons, callback laziness, malformed callbacks, stale-session invalidation, transaction rollback, or retry/reconnect behavior where relevant.
2. Use real production procedures and existing test seams. Verify public and inferred types when interfaces change. Run scoped Nx builds, typechecks, lint, and formatting as required.
3. Keep an iteration log containing: RPC owner/method, status, reviewed call stack, agreed changes, retained invariants, verification results, and remaining work.
4. Keep this parent plan active between iterations. Archive it only when the pending list is complete or I explicitly end the effort; record the outcome.

**Acceptance criterion:** understanding each completed RPC path requires fewer unexplained concepts and indirections, and every retained conditional has a clear, evidenced purpose.

## API method queue — 2026-10-08

Historical inventory: the pending labels below record the original queue. The complete framework review now covers its source review; follow that review's owning plans for continuing implementation.

1. `AggregateAccessApi.authorize` — reviewed in completed Plan 068.
2. `AggregateApi.admit` — completed backend provisioning during session authorization and admission cleanup; verified in Iteration 1. Focused `admitAggregate` cleanup and direct aggregate command admission are implemented and verified in Iterations 3 and 4.
3. `AggregateSessionApi.createWebSocketTicket` — completed; bound-version ticket issuance verified in Iteration 2.
4. `AggregateSessionApi.executeServiceQuery` — pending.
5. `AggregateSessionApi.getBrowserCommands` — pending.
6. `AggregateSessionApi.getSnapshot` — pending.
7. `GatewayApi.aggregate` — pending.
8. `GatewayApi.getSystemApi` — pending.
9. `GatewayApi.service` — pending.
10. `ServiceAccessApi.authorize` — pending.
11. `ServiceApi.admit` — pending.
12. `ServiceSessionApi.createWebSocketTicket` — pending.
13. `ServiceSessionApi.getBrowserCommands` — pending.
14. `ServiceSessionApi.getSnapshot` — pending.
15. `SystemApi.checkSystemSpec` — pending.
16. `SystemApi.executeAggregateCommand` — pending.
17. `SystemApi.executeSelectQuery` — pending.
18. `SystemApi.executeServiceCommand` — pending.
19. `SystemApi.executeServiceQuery` — pending.
20. `SystemApi.getAgentAggregateIds` — pending.
21. `SystemApi.getAggregateChainTableRows` — pending.
22. `SystemApi.getAggregateChains` — pending.
23. `SystemApi.getAggregateProjectionChainTableRows` — pending.
24. `SystemApi.getAggregateProjectionChains` — pending.
25. `SystemApi.getAggregateProjectionRepoTableRows` — pending.
26. `SystemApi.getAggregateProjectionRepos` — pending.
27. `SystemApi.getAggregateVersionChainTableRows` — pending.
28. `SystemApi.getAggregateVersionChains` — pending.
29. `SystemApi.getAggregateVersionRepoTableRows` — pending.
30. `SystemApi.getAggregateVersionRepos` — pending.
31. `SystemApi.getBackendError` — pending.
32. `SystemApi.getServiceActorVersionChainTableRows` — pending.
33. `SystemApi.getServiceActorVersionChains` — pending.
34. `SystemApi.getServiceActorVersionRepoTableRows` — pending.
35. `SystemApi.getServiceActorVersionRepos` — pending.
36. `SystemApi.getServiceChainTableRows` — pending.
37. `SystemApi.getServiceChains` — pending.
38. `SystemApi.getServiceVersionChainTableRows` — pending.
39. `SystemApi.getServiceVersionChains` — pending.
40. `SystemApi.getServiceVersionRepoTableRows` — pending.
41. `SystemApi.getServiceVersionRepos` — pending.
42. `SystemApi.getSystemLogRepoTableRows` — pending.
43. `SystemApi.getSystemLogRepos` — pending.
44. `SystemApi.getSystemRepoTableRows` — pending.
45. `SystemApi.getSystemRepos` — pending.
46. `SystemApi.healthcheck` — pending.
47. `SystemApi.initialize` — pending.
48. `SystemApi.makeSystemSpec` — pending.
49. `SystemApi.openAgentSession` — pending.

This is the source-verified capability API queue. Repo RPC methods reached by these methods are recorded in each call map; the broader Repo RPC catalog remains to be inventoried before claiming exhaustive framework coverage.

## Iteration 1 — Backend provisioning during session authorization

1. Status: complete. Implementation, scoped verification, and documentation reconciliation are finished. The backend authorization flow supersedes the discarded browser direct-command and named-RPC proposals. The final-command naming slice remains implemented and verified.
2. Prerequisites: Repo-owned session authorization from [068](068-plan-aggregate-session-authorization.md) and required aggregate authentication from [070](070-plan-required-aggregate-authentication.md).
3. Agreed flow: initialize session → authenticate credentials → authorize, creating the User if needed → grant session access. Clients never submit `createUser`; the actor authorizer executes it through aggregate/system authority.
4. Scope: aggregate authorization, shared direct execution, admission cleanup, local RPC failure naming, and affected tests/docs. No new RPC catalog, browser execution SDK, protected flag, service-authorization changes, fixed-schema changes, storage resets, QRK migration, or package publication. Preserve unrelated working-tree work.

### Agreed behavior

1. Authentication accepts credentials and returns verified claims. It receives no command capability. Admission remains credential-only, including runtime authentication-policy validation, credentials/claims codecs, aggregate-ID validation, actor partition round-trip checks, audit settlement, and diagnostic telemetry.
2. `actor.authorize` receives verified claims, bound aggregate ID and session name, aggregate-owned queries, and `executeCommand(command)`. Its success contract remains `void`. Default authorizers add no resource restriction; actor updates inherit omitted authorizers. Application-service inference includes authorization requirements while excluding framework services supplied by the system runtime.
3. The author constructs an ordinary command through `makeCommand({ contract, payload })`. The authorizer's execution callback resolves its name/version from the bound aggregate release's owner catalog, encodes the payload, and constructs system provenance internally. The caller cannot substitute aggregate identity, release, actor claims, origin, session fields, or a continuation response. External continuations and commands requiring actor claims are refused before staging.
4. `executeDirectAggregateCommand` shares production administration projection staging, the retained admission barrier, AggregateChain submission, and authoritative final-command recovery with `SystemApi.executeAggregateCommand`. Keep synchronous mutation transactions and recovery through the original execution version. Authorization runs outside execution permits and SQLite transactions so same-owner RPC reentry can progress.
5. `createUser` belongs to the aggregate owner catalog and stays outside client actor catalogs. The application authorizer derives identity from verified claims, reads the User, creates only when missing, accepts its recognized existing-user outcome, and reads again before granting access. Command guards and uniqueness constraints own concurrency in the command transaction. Existing profile, permission, and disabled-account state remain intact.
6. Command results stay backend-side. Authorizers inspect the existing authoritative final command and refuse through ordinary public authorization errors and telemetry. A resolved rejected command is a final domain outcome; a transport failure can leave the remote outcome unknown.
7. Authored authorization controls retry scheduling. Construct once before retrying execution within an invocation; another authorization attempt may construct a separate command. Preserve existing repeated-ID recovery without new content-conflict rules, identity registries, automatic retry policies, or browser persistence. Creation remains durable when later authorization refuses.
8. Classify recognized fetch transport failures as `rpc-invocation-failed`, including its failure union and browser classifiers. Preserve server codes and network-unavailable metadata. Unexpected rejections remain defects; internal RPC calls use `Effect.promise` and decode declared failures from their envelopes.

### Admission cleanup and retained guarantees

1. Remove only the inner `AggregateAdmissionRequestSchema` decode. The public API validates credential-only requests before beginning the audit, preserving its excess-property policy and public failure code. Invalid helper test inputs move to that API seam.
2. Resolve the actor directly within the bound aggregate release and check the exact actor version. Remove the fabricated one-entry registry here while retaining historical provenance resolvers elsewhere.
3. Compose authentication with returned-claims validation directly. Use `actor`, `authentication`, `systemLogRepo`, `encodedClaims`, and `admissionExit`; use precise actor partition names for field selection, decoded identity, encoded identity, path parameters, and recovered identity.
4. Preserve runtime authentication declaration validation because actor declarations remain mutable. Keep claims schema/type/encoding checks, the acct ID check, selected-field restriction, decoded identity equality, and canonical href equality.
5. Keep the audit's `Exit` and full cause. Success, ordinary failure, and defects settle the durable attempt; any cause containing interruption leaves it unfinished. Keep uninterruptible audit writes and propagation of the original cause. Successful access is withheld until its completion write is durable.
6. Preserve `claimsHash` and serialization, the public audit fields, and the distinction between mandatory audit settlement and diagnostic telemetry persistence. Diagnostic persistence failure never replaces the domain outcome.

### Designs replaced

1. Browser `makeAggregateAccess`, admitted access direct-command RPC, and client submission of `createUser` are discarded. Ordinary browser initialization invokes backend provisioning through authorization.
2. Named registration RPC catalogs, operation discriminators in authorization, command-authorization capabilities, and protected flags are unnecessary for the agreed flow.
3. Authentication-owned provisioning and a separate provisioner actor are replaced by the ordinary user authorizer's owner-command execution. Service authorization retains its existing contract.
4. Generic upsert on login is rejected: provisioning must preserve existing data and account state. The domain command owns uniqueness and its recognized existing-user outcome.

### Implementation sequence

1. Remove authentication's `executeCommand` input and embedded execution path; add the command callback to aggregate actor authorization and bind it to the authorizing Repo's identity and release.
2. Share administration staging and authoritative execution with `SystemApi`, retaining original-version recovery, admission barriers, and synchronous mutation ownership.
3. Include authored authorization requirements in system layer inference, excluding framework services; preserve default, inherited, and replacement callback inference.
4. Complete admission cleanup and `rpc-invocation-failed` naming through a hard cutover.
5. Extend administration checks and add the isolated Wrangler provisioning check with required Nx dependencies.
6. Run required scoped verification, reconcile affected documentation and glossary, and review the diff. Create an ADR only if the implemented choice is hard to reverse, surprising without context, and the result of a real trade-off.
7. Mark Iteration 1 complete only after verification; leave this plan active for the remaining RPC queue. Stop before selecting its next method.

### Planned hierarchy

`~` means modify; `+` means create.

```text
zerospin/
├── packages/core/src/
│   ├── ~ identity/types.ts
│   ├── ~ aggregateActor/types.ts
│   ├── ~ aggregateActor/README.md
│   ├── ~ system/make/makeSystem/makeSystem.ts
│   └── ~ utils/getApi/getApi.ts
├── packages/system-worker/
│   ├── ~ src/AggregateApi/admit/admitAggregate/admitAggregate.ts
│   ├── ~ src/AggregateVersionRepo/authorizeSession/authorizeSession.ts
│   ├── ~ src/AggregateVersionRepo/AggregateVersionRepo.ts
│   ├── ~ src/AggregateChain/AggregateChain.ts
│   ├── + src/executeDirectAggregateCommand/executeDirectAggregateCommand.ts
│   ├── ~ src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts
│   ├── ~ checks/aggregate-administration.mjs
│   ├── + checks/authorization-provisioning/
│   │   ├── run.mjs
│   │   ├── worker.ts
│   │   ├── config.ts
│   │   └── wrangler.jsonc
│   ├── ~ package.json
│   └── ~ project.json
├── packages/browser/src/
│   ├── ~ Node/isNodeNetworkUnavailable.ts
│   ├── ~ AggregateNode/resolveAggregateNode.ts
│   └── ~ ServiceNode/resolveServiceNode.ts
└── wiki/
    └── ~ existing plan, handoff, glossary, and affected documentation
```

### Verification

1. Extend `system-worker:aggregate-administration:check` with authorization-owned execution, invalid requests preventing writes, forged client submissions of owner-only commands, guard refusal, synchronous rollback, final-result handling, and callback/application-layer inference.
2. Add `system-worker:authorization-provisioning:check` using Wrangler, production Durable Objects, and isolated temporary storage. Exercise actual same-owner RPC reentry, concurrent first authorizations creating one User, repeat authorization preserving profile/permission data, lost-response recovery, and refusal before capability grant. Verify successful creation survives later refusal.
3. Preserve admission coverage for malformed credential-only requests before the audit, unsupported actor versions, callback rejection, malformed claims, acct IDs, claims/path codecs and canonical actor partition round trips.
4. Verify audit begin/completion failure, durable success, ordinary failure, defects, pure interruption, and mixed failure/interruption causes. Preserve public authorization errors and diagnostic telemetry behavior.
5. Run scoped core/worker/browser Nx typechecks, lint, administration and initialized-session checks with required library dependencies. Finish with formatting of changed files and `git diff --check`. Reconcile affected existing documentation and glossary after implementation.

### QRK follow-up — separately scoped

1. Move provisioning into QRK's ordinary user authorizer. Authentication only verifies Clerk credentials and returns accepted claims. Remove `userProvisionerV1`; make `createUser` owner-only.
2. Derive subject/identity from verified claims, preserve the independent User ID and subject uniqueness, create only when absent, accept the recognized existing-user outcome, then read the User again before authorizing the session.
3. Preserve existing profile, memberships, permissions, and disabled-account state. Construct once per authorization invocation before applying authored retries. Direct Studio entry uses ordinary session initialization.
4. Migration, publication, and exact package dependency changes require separate consumer scope. No QRK source changes occur in this iteration.

### Source pointers

1. [Aggregate authentication types](../../../packages/core/src/identity/types.ts) and [actor authorization types](../../../packages/core/src/aggregateActor/types.ts).
2. [Admission](../../../packages/system-worker/src/AggregateApi/admit/admitAggregate/admitAggregate.ts), [Repo authorization](../../../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/authorizeAggregateSession.ts), and [shared direct execution](../../../packages/system-worker/src/executeDirectAggregateCommand/executeDirectAggregateCommand.ts).
3. [SystemApi execution](../../../packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts), [socket command admission](../../../packages/system-worker/src/aggregateSessionChain/onMessage/admitAggregateSessionCommand.ts), and [original-version recovery](../../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts).
4. [RPC invocation](../../../packages/core/src/utils/getApi/getApi.ts) and [repeated-ID guidance](../../patterns/apis/return-the-domain-object.md).
5. Historical runners `packages/system-worker/checks/aggregate-administration.mjs` and `packages/system-worker/checks/authorization-provisioning/run.mjs` (subsequently removed).

### Final command terminology — 2026-10-08

1. The user approved `finalCommand` and final terminology throughout the repository. Rename aggregate/service final-command schemas, local values and predicates, diagnostic codes, checks, examples, Explorer descriptions, and authored documentation directly. Keep console UI and external terminal tooling names in their existing meaning.
2. Define final as an authoritative completed outcome, including admission rejection or execution failure. Preserve schema fields, status values, stored rows, transaction ownership, and wire shapes; no storage reset or compatibility interface is required.
3. Verified: one scoped Nx graph passed core/worker/browser/Shopping `ts` and `lint`, Explorer `lint`, worker `aggregate-administration:check`, and browser `initialized-session:check`, including required library dependencies. The administration check covered authoritative guard enforcement, durable refusals, projection isolation, recovery, tickets, and admission barriers. Initialized-session checks covered claims, inferred types, transactions, lifecycle, and queued delivery.
4. Scoped formatting passed for all 102 edited files; three new or renamed local documentation links/anchors passed; `git diff --check` and source-diff review passed. The exported schema rename changes names only, with no compatibility aliases or fixed-schema changes. Existing unrelated lint warnings remain; Nx Cloud reported access code 401 after the local graph passed. The unrelated `getApi` edit and prior documentation consolidation work were preserved.
5. Remaining work for this naming slice: None. Its earlier verification preceded the separate backend provisioning implementation and verification recorded below.

### Implementation outcome — 2026-10-08

1. Authentication now receives credentials only. Aggregate authorization owns the bound command callback and returns `void`; default/inherited authorizers and application-service inference are preserved. Framework command/RPC services do not require an application layer.
2. Authorization and SystemApi share production administration staging, retained admission, and authoritative final-command recovery. The abandoned authentication-only actor staging branch was removed. No mutation transaction or execution permit spans authorization or delivery RPCs; original executor recovery and repeated-ID behavior remain intact.
3. The administration check covers invalid claims/locks/commands before writes, forged owner-only actor submissions, system provenance, final-result handling, guard refusal and synchronous rollback, default/inherited/replacement callbacks, framework/application service inference, and audit settlement versus interruption. The real provisioning fixture's authorizer is included in its typecheck.
4. The isolated Wrangler check uses production Durable Objects and a deterministic first-read barrier to exercise same-owner reentry, two first authorization attempts producing one User, preservation of profile/permission data, recovery after a response is lost after commit, and refusal before access. A committed creation survives later authorization refusal.
5. Scoped Nx core/worker/browser typechecks and lint, administration, authorization-provisioning, and initialized-session checks passed with required library dependencies. Existing unrelated lint warnings remain. Nx Cloud reports access code 401 after the local checks pass; no Cloud configuration was changed.
6. Affected module READMEs, session/execution diagrams, glossary, and this handoff/plan reflect the implemented flow. Scoped formatting, source links/citations, and diff review are complete. No fixed schema, stored rows, or QRK source was changed; unrelated working-tree edits remain in place. No commit or publication was requested.
7. No ADR was added: this reuses existing aggregate/system authority and transaction owners without a hard-to-reverse persistence decision. The remaining RPC queue stays active; selecting its next method requires the next iteration's review.
8. Remaining work for Iteration 1: None.

## Iteration 2 — AggregateSessionApi.createWebSocketTicket

1. Status: complete on 2026-10-08. The user approved removing the echoed version argument only.
2. Reviewed flow: browser admission and authorization → session capability → request validation and bound-release availability → projection registration lookup → SystemRepo ticket issuance → telemetry persistence. Related consumption and socket resume checks were inspected to understand the registration prerequisite.
3. Agreed change: accept an empty RPC argument tuple and use the capability's aggregateVersion throughout. Update the browser caller to `createWebSocketTicket()`. The rejected-capability method derives its argument type from the granted method.
4. Retain the projection-registration prerequisite, systemId decoding, bound-release availability check, ticket persistence and consumption, and telemetry behavior. Removing the registration gate was discussed but not approved. No fixed schema or storage changes.
5. Verification: `pnpm nx run-many -t ts lint authorization-provisioning:check -p system-worker @zerospin/browser` passed with required library dependencies. The isolated Wrangler fixture verified empty-argument issuance, the retained projection-registration prerequisite, and the consumed ticket's admitted version, actor, and exact lock. Scoped formatting and diff checks passed. Existing lint warnings remain (39 worker, 3 browser); Nx Cloud reported access code 401 after the local checks passed.
6. Documentation: method comments and this iteration log describe bound-version issuance. No new domain term or qualifying ADR was introduced. Unrelated Explorer work was preserved.
7. Remaining work for Iteration 2: None. Stop before selecting the next RPC method.

## Iteration 3 — AggregateApi.admitAggregate

### Status and objective — 2026-10-09

1. Status: complete on 2026-10-09. Source extraction, fixture coverage, documentation reconciliation, emitted-type verification, and all required worker/Explorer checks are finished. The user authorized this iteration with “Implement plan 69.” Preserve concurrent session-release and worker work.
2. Make `admitAggregate` read as owner/actor resolution followed by audited authentication, actor partition selection, claims hashing, and returned admission data. Its current nesting obscures these separate responsibilities and the audit's interruption policy.
3. Create four substantive, feature-local procedures in `admitAggregate/utils/`: `auditAggregateAdmission.ts`, `authenticateAggregateClaims.ts`, `makeAggregateActorSelection.ts`, and `hashAggregateAdmissionClaims.ts`. Import each directly; create no barrel, registry, compatibility export, or single-call RPC wrapper.
4. This is a behavior-preserving refactor of current source. In particular, authentication receives `{ aggregateId, credentials }`, as introduced by the session-release work; the credentials-only historical outcome in Iteration 1 is not this iteration's baseline. Do not change admission schemas, storage, authentication, authorization, or the outer RPC interface.

### Current flow and baseline

1. `AggregateApi.admit` validates the request before calling `admitAggregate`; it constructs an access capability only after admission succeeds. Retain that boundary. Do not repeat its whole-request decoding in the extracted procedures.
2. `admitAggregate` selects the authored aggregate release and exact actor version, captures authentication, and acquires `SystemLogRepo`. Only then does it enter an uninterruptible audit boundary and persist an unfinished attempt.
3. Authentication, claims validation/encoding, canonical actor partition selection, hashing, and response assembly run together under restored interruptibility. The boundary observes their complete Exit and settles the durable attempt before returning success or a non-interruption failure.
4. Current measured size: 245 file lines; 228 lines from the exported declaration through its closing call (lines 18–245). A TypeScript AST count finds eight `if` statements, one `while`, and one `for…of` within that declaration, including nested callbacks. This is a control-statement count, not a cyclomatic-complexity score; no configured complexity rule was found.
5. Visible nesting includes the root generator, `uninterruptibleMask`, its audit generator, and the restored admission generator, with additional schema callbacks. The parent owns lookup, policy decoding, credentials decoding, authentication, claims checks, partition codecs, path round trips, recursive serialization, hashing, and audit settlement.
6. The function lacks numbered phase annotations. Establish their proposed boundaries here; add the overview and matching checkpoints as part of the approved source refactor. Planning does not add comments to a production file being changed concurrently.

### Extraction map

| Proposed checkpoint                                  | Current source span | Decision                                 | Reason                                                                                                                            |
| ---------------------------------------------------- | ------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1. Resolve the requested aggregate and actor version | 27–40               | Remain inline                            | Two meaningful availability guards and direct lookups; another function would hide the binding without owning a larger invariant. |
| 2. Capture authentication and acquire the system log | 41–44               | Remain inline                            | Preserve their timing before attempt creation; acquiring a stub alone does not deserve a wrapper.                                 |
| 3. Own the durable admission attempt                 | 45–54, 215–244      | `auditAggregateAdmission`                | Begin, restored execution, Exit inspection, interruption, and settlement form one inseparable lifecycle.                          |
| 3a. Authenticate and encode complete claims          | 55–112              | `authenticateAggregateClaims`            | Own policy/credential validation, authentication, complete claims, and requested aggregate identity agreement.                    |
| 3b. Derive the reversible actor partition selection  | 113–181             | `makeAggregateActorSelection`            | Pick only actorPath fields and prove their encoded route has a lossless canonical round trip.                                     |
| 3c. Hash encoded full claims                         | 182–205             | `hashAggregateAdmissionClaims`           | Preserve one exact serialization and digest algorithm; keep incidental loops out of orchestration.                                |
| 3d. Assemble the admission result                    | 206–214             | Remain inline inside the audited program | A small return object; its metadata reads must still occur inside the observed Exit.                                              |

### Retained conditions and boundaries

1. Keep aggregate availability and actor/version agreement before audit creation. The first blocks unavailable authored releases; the second blocks absent actors and unsupported actor versions. Neither establishes authenticated identity.
2. Keep strict policy, credential, full-claim, and partition decoding. They address different authored and runtime trust boundaries. Keep `NanoIdFactory` around authentication and its full-claim decoding, at the existing point in execution.
3. Keep both aggregate-ID checks: `acct` decoding rejects an invalid identity; requested-ID equality prevents authentication for one aggregate from granting access to another. Full claims remain server-produced; client claims are not authorization evidence.
4. Keep string-encoded partition parameters, matched-path decoding, semantic identity equality, and canonical reformatting. Together these prevent a route or codec from losing partition identity. Do not include unrelated full-claim fields in the partition.
5. Preserve error codes and messages. The second `createHref` in the equality check currently throws a defect if formatting throws; retain that behavior rather than placing the whole phase inside a new `Effect.try`.
6. Keep recursive key collection and the exact `JSON.stringify(encodedClaims, sortedKeys)` input to SHA-256. The existing `hashNodeValue` has JSON validation and a different canonicalization implementation; replacing this algorithm is outside a cleanup refactor. Arrays retain order; nested object keys participate in the sorted key list; full encoded claims determine the hash.
7. Preserve all complete-Cause behavior. Any interruption, including a mixed failure/interruption cause, leaves the already-persisted attempt unfinished. A non-interruption failure or defect records the generic audit failure and then propagates the original Cause if completion succeeds. If completion fails, its failure remains the execution outcome, as it is today.
8. Keep begin and completion protected by the same mask. Do not replace the boundary with `ensuring`, `tapError`, a failure-only catch, retries, or a success-only hook. A success is withheld until its completion RPC and envelope consumption succeed. No transaction or lock spans authentication, remote RPC, or hashing; the log repository continues to own its writes.
9. Preserve `readRpcEnvelope` at each remote audit call, including telemetry merging before consumption of its result. Keep the root span name and `root: true`; extracted `Effect.fn` procedures add ordinary child spans. Never attach raw credentials to telemetry.

### Utility 1 — auditAggregateAdmission

1. Destination: `packages/system-worker/src/AggregateApi/admit/admitAggregate/utils/auditAggregateAdmission.ts`. Move spans 45–54 and 215–244 together. This function owns the durable attempt, not owner lookup or log acquisition.
2. Inputs: a narrow `SystemLogRepo` method view, aggregate name/version, and a lazy admission Effect. Its success constraint contains the fields required by the existing completion RPC; generic `ADMISSION` preserves the parent's additional metadata without a second response type. Generic `FAILURE` and `SERVICES` retain the supplied program's failure and service requirements.
3. Success: the same admission value, after durable completion. Typed failures: the program's failures, existing local `IAnyError` failures, and encoded remote `IZerospinErrorJson` failures. Requirements: the program's services; no interpreter or provided application layer.
4. Use `Effect.fn`: this is an RPC and interruption boundary with a complete-Exit policy. Give its exported generator an explicit `Effect.fn.Return` using existing public types. The `SystemLogRepo` import is type-only; the real acquisition and existing fixture mock stay in the parent.

```ts
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  type IAnyError,
  type IZerospinErrorJson,
  catchZerospinError,
} from '@zerospin/error';
import { Cause, Effect, Exit } from 'effect';

import type { SystemLogRepo } from '../../../../SystemLogRepo/SystemLogRepo.js';

/** Settle an admission attempt before returning; interruption leaves it unfinished. */
export const auditAggregateAdmission = Effect.fn(
  'AggregateApi.auditAggregateAdmission',
)(function* <
  ADMISSION extends {
    claims: Readonly<Record<string, unknown>>;
    claimsHash: string;
    selection: Readonly<Record<string, string>>;
    actorPath: string;
  },
  FAILURE,
  SERVICES,
>(props: {
  systemLogRepo: Pick<
    SystemLogRepo,
    'beginAggregateAdmissionAttempt' | 'completeAdmissionAttempt'
  >;
  aggregateName: string;
  aggregateVersion: string;
  program: Effect.Effect<ADMISSION, FAILURE, SERVICES>;
}): Effect.fn.Return<
  ADMISSION,
  FAILURE | IAnyError | IZerospinErrorJson,
  SERVICES
> {
  return yield* Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      // 1 — persist the attempt before running admission
      const { attemptId } = yield* Effect.promise(() =>
        props.systemLogRepo.beginAggregateAdmissionAttempt({
          aggregateName: props.aggregateName,
          aggregateVersion: props.aggregateVersion,
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

      // 2 — observe the complete outcome under restored interruptibility
      const admissionExit = yield* restore(props.program).pipe(Effect.exit);
      if (Exit.isFailure(admissionExit)) {
        if (Cause.hasInterrupts(admissionExit.cause)) {
          return yield* Effect.failCause(admissionExit.cause);
        }

        // 3 — settle a non-interruption failure before propagating its Cause
        yield* Effect.promise(() =>
          props.systemLogRepo.completeAdmissionAttempt({
            attemptId,
            result: {
              status: 'failed',
              failure: {
                code: 'admission-failed',
                message: 'Admission did not succeed',
              },
            },
          }),
        ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
        return yield* Effect.failCause(admissionExit.cause);
      }

      // 4 — require durable success before returning admission data
      yield* Effect.promise(() =>
        props.systemLogRepo.completeAdmissionAttempt({
          attemptId,
          result: { status: 'succeeded', ...admissionExit.value },
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
      return admissionExit.value;
    }),
  );
});
```

5. Parent replacement:

```ts
return (
  yield *
  auditAggregateAdmission({
    systemLogRepo,
    aggregateName: props.aggregateName,
    aggregateVersion: props.aggregateVersion,
    program: Effect.gen(function* () {
      const { claims, encodedClaims } = yield* authenticateAggregateClaims({
        actor,
        authentication,
        request: props.request,
      });
      const { selection, actorPath } = yield* makeAggregateActorSelection({
        identity: actor.identity,
        claims,
      });
      const claimsHash = yield* hashAggregateAdmissionClaims({
        claims: encodedClaims,
      });
      return {
        claims: encodedClaims,
        claimsHash,
        selection,
        actorName: actor.name,
        actorVersion: actor.version,
        actorPath,
        systemName: system.name,
      };
    }),
  })
);
```

6. Imports: move `Cause`, `Exit`, audit uses of `Effect.promise`, and `readRpcEnvelope` out of the parent. The parent keeps `Effect` and its runtime `SystemLogRepo` import. Add only public error/service type imports to this procedure.
7. Tests: reuse the existing admission-log seam in `aggregate-administration.mjs` to verify begin-before-authentication, complete-before-grant, original failure/defect Cause after successful failed settlement, pure and mixed interruption without completion, begin failure without authentication, and completion failure withholding success. Add the missing failed-admission/completion-failure case to lock current precedence. Verify audit envelope telemetry still merges. Do not add separate one-call wrappers or replace production procedures with test-only implementations.

### Utility 2 — authenticateAggregateClaims

1. Destination: `packages/system-worker/src/AggregateApi/admit/admitAggregate/utils/authenticateAggregateClaims.ts`. Move lines 55–112. Own strict authentication policy and credential checks, one authentication call, full-claim decoding, valid/requested aggregate identity, and full-claim encoding.
2. Inputs: `actor: Pick<IAnyAggregateActorVersion, 'identity'>`, the already captured `IAggregateAuthentication`, and the current `IAggregateAdmissionRequest`. Do not pre-read claims schemas in the parent; their use remains inside audited execution at the existing phase.
3. Success: decoded `claims` and `encodedClaims`, both `Readonly<Record<string, unknown>>`. Typed failures retain `admission-policy-invalid`, `authentication-credentials-invalid`, callback `IAnyError`, `identity-result-invalid`, `identity-aggregate-id-invalid`, and `identity-aggregate-id-mismatch`. Requirements: none; the existing `NanoIdFactory` supplies `CuidFactory` only around authentication/full-claim decoding.
4. Use `Effect.fn`: this procedure validates, invokes an effectful authored callback, and supplies an ID service. Its explicit return contract avoids exporting inferred private error internals; it introduces no casts or new public API.

```ts
import type { IAnyAggregateActorVersion } from '@zerospin/core/aggregateActor/types';

import { AggregateAuthenticationSchema } from '@zerospin/core/identity/AggregateAuthenticationSchema';
import type {
  IAggregateAdmissionRequest,
  IAggregateAuthentication,
} from '@zerospin/core/identity/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

/** Authenticate complete claims for the explicitly requested aggregate. */
export const authenticateAggregateClaims = Effect.fn(
  'AggregateApi.authenticateAggregateClaims',
)(function* (props: {
  actor: Pick<IAnyAggregateActorVersion, 'identity'>;
  authentication: IAggregateAuthentication;
  request: IAggregateAdmissionRequest;
}): Effect.fn.Return<
  {
    claims: Readonly<Record<string, unknown>>;
    encodedClaims: Readonly<Record<string, unknown>>;
  },
  IAnyError,
  never
> {
  const { actor, authentication, request } = props;

  // 1 — validate the authored policy and incoming credentials
  yield* Schema.decodeUnknownEffect(AggregateAuthenticationSchema)(
    authentication,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'admission-policy-invalid',
      prefix: 'Invalid actor authentication policy',
    }),
  );
  const credentials = yield* Schema.decodeUnknownEffect(
    Schema.toType(authentication.credentialsSchema),
  )(request.credentials, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'authentication-credentials-invalid',
      prefix: 'Invalid authentication credentials',
    }),
  );

  // 2 — authenticate once, then validate the server-produced complete claims
  const claims = yield* authentication
    .authenticate({ aggregateId: request.aggregateId, credentials })
    .pipe(
      Effect.flatMap(value =>
        Schema.decodeUnknownEffect(Schema.toType(actor.identity.claimsSchema))(
          value,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'identity-result-invalid',
            prefix: 'Invalid identity result',
          }),
        ),
      ),
      Effect.provide(NanoIdFactory),
    );

  // 3 — require a valid aggregate ID matching the caller's explicit selection
  yield* Schema.decodeUnknownEffect(Schema.String)(claims.aggregateId).pipe(
    mapParseError({
      code: 'identity-aggregate-id-invalid',
      prefix: 'Claims must supply an aggregate ID',
    }),
  );
  if (claims.aggregateId !== request.aggregateId) {
    return yield* makeZerospinError({
      code: 'identity-aggregate-id-mismatch',
      message:
        'Authenticated aggregate ID does not match the requested aggregate',
    });
  }

  // 4 — retain encoded full claims for the admission result and its hash
  const encodedClaims = yield* Schema.encodeEffect(actor.identity.claimsSchema)(
    claims,
  ).pipe(
    mapParseError({
      code: 'identity-result-invalid',
      prefix: 'Claims could not be encoded',
    }),
  );
  return { claims, encodedClaims };
});
```

5. Parent replacement:

```ts
const { claims, encodedClaims } =
  yield *
  authenticateAggregateClaims({
    actor,
    authentication,
    request: props.request,
  });
```

6. Imports: move `AggregateAuthenticationSchema`, `NanoIdFactory`, `makeAbbreviationIdSchema`, and authentication uses of `Schema`/`mapParseError` into this file. Add the existing actor, authentication, error, types. The parent retains `IAggregateAdmissionRequest` and `makeZerospinError` for its inline guards.
7. Tests: retain malformed policy/credentials, authentication rejection/defect/interruption, full-claim decode/encode failures, valid public credentials, invalid returned aggregate ID, requested-ID mismatch without capability grant, and authentication invocation counts. Assert authentication receives both the requested ID and decoded credentials; no later phase runs after refusal.

### Utility 3 — makeAggregateActorSelection

1. Destination: `packages/system-worker/src/AggregateApi/admit/admitAggregate/utils/makeAggregateActorSelection.ts`. Move lines 113–181 as one invariant. Do not split formatting and reversibility checks into independent helpers.
2. Inputs: `identity: Pick<IActorIdentity, 'identitySchema' | 'pattern'>` and decoded complete claims. Success: `{ selection: Readonly<Record<string, string>>, actorPath: string }`. The selection contains encoded actorPath fields only. Typed failures: existing `identity-selection-invalid` normalization; requirements: none. Existing unnormalized formatting defects still escape to the audit boundary.
3. Use `Effect.fn`: schema codecs and route construction can fail, and this procedure owns their normalization and the lossless round-trip guarantee. `createHref` and `createMatcher` alone do not need wrappers.

```ts
import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import type { IActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

/** Derive only actor partition fields and prove their canonical path is reversible. */
export const makeAggregateActorSelection = Effect.fn(
  'AggregateApi.makeAggregateActorSelection',
)(function* (props: {
  identity: Pick<IActorIdentity, 'identitySchema' | 'pattern'>;
  claims: Readonly<Record<string, unknown>>;
}): Effect.fn.Return<
  { selection: Readonly<Record<string, string>>; actorPath: string },
  IAnyError
> {
  const { identity, claims } = props;

  // 1 — select and validate only the actorPath identity fields
  const actorIdentityFields = Object.fromEntries(
    Object.keys(identity.identitySchema.fields).map(field => [
      field,
      claims[field],
    ]),
  );
  const actorIdentity = yield* Schema.decodeUnknownEffect(
    Schema.toType(identity.identitySchema),
  )(actorIdentityFields, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'identity-selection-invalid',
      prefix: 'Invalid selection claims',
    }),
  );
  const encodedActorIdentity = yield* Schema.encodeEffect(
    identity.identitySchema,
  )(actorIdentity).pipe(
    mapParseError({
      code: 'identity-selection-invalid',
      prefix: 'Selection could not be encoded',
    }),
  );
  const selection = yield* Schema.decodeUnknownEffect(
    Schema.Record(Schema.String, Schema.String),
  )(encodedActorIdentity).pipe(
    mapParseError({
      code: 'identity-selection-invalid',
      prefix: 'Selection claims must encode as strings',
    }),
  );

  // 2 — format the partition path and match its encoded parameters
  const actorPath = yield* Effect.try({
    try: () => createHref(identity.pattern, selection),
    catch: () =>
      makeZerospinError({
        code: 'identity-selection-invalid',
        message: 'Selection could not be formatted',
      }),
  });
  const matched = yield* Effect.try({
    try: () =>
      createMatcher(identity.pattern).match(
        new URL(actorPath, 'https://selection.invalid'),
      ),
    catch: () =>
      makeZerospinError({
        code: 'identity-selection-invalid',
        message: 'Selection path could not be matched',
      }),
  });

  // 3 — require semantic identity equality and canonical path equality
  const recoveredActorIdentity = yield* Schema.decodeUnknownEffect(
    identity.identitySchema,
  )(matched?.params, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'identity-selection-invalid',
      prefix: 'Selection path is not reversible',
    }),
  );
  if (
    !isEqual(recoveredActorIdentity, actorIdentity) ||
    createHref(identity.pattern, matched?.params) !== actorPath
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'identity-selection-invalid',
        message: 'Selection must have a lossless canonical round trip',
      }),
    );
  }
  return { selection, actorPath };
});
```

4. Parent replacement:

```ts
const { selection, actorPath } =
  yield *
  makeAggregateActorSelection({
    identity: actor.identity,
    claims,
  });
```

5. Imports: move both route-pattern functions and `isEqual` out of the parent; move partition `Schema`/`mapParseError` uses here and add the existing `IActorIdentity` type. No new partition DTO or string cast.
6. Tests: preserve exclusion of non-partition claims, transformed codecs with string wire values, non-string encoded partition refusal, formatting/matching failures, non-reversible decoding, and semantic/canonical disagreement. Add focused cases at the existing admission boundary using forged authored identities only where construction normally rejects invalid composition. Preserve phase ordering and defect handling rather than weakening authoring validation to manufacture fixtures.

### Utility 4 — hashAggregateAdmissionClaims

1. Destination: `packages/system-worker/src/AggregateApi/admit/admitAggregate/utils/hashAggregateAdmissionClaims.ts`. Move lines 182–205 without changing bytes or accepted input behavior. Inputs: encoded complete claims. Success: lowercase hexadecimal SHA-256 string. Typed failures: none; requirements: none. Unexpected serialization or digest failures are defects.
2. Use `Effect.fn`: recursive serialization may throw and Web Crypto is asynchronous. Keep serialization inside the lazy `Effect.promise` callback, preserving defects. This is not a total plain transformation.

```ts
import { Effect } from 'effect';

/** Hash the existing sorted-key JSON encoding of complete admission claims. */
export const hashAggregateAdmissionClaims = Effect.fn(
  'AggregateApi.hashAggregateAdmissionClaims',
)(function* (props: {
  claims: Readonly<Record<string, unknown>>;
}): Effect.fn.Return<string, never, never> {
  // 1 — collect object keys recursively, retaining array order
  const keys = new Set<string>();
  const pending: unknown[] = [props.claims];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
    } else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        pending.push(child);
      }
    }
  }

  // 2 — digest the existing sorted-key JSON bytes and return lowercase hex
  const digest = yield* Effect.promise(() =>
    crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(props.claims, [...keys].sort())),
    ),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
});
```

3. Parent replacement:

```ts
const claimsHash =
  yield *
  hashAggregateAdmissionClaims({
    claims: encodedClaims,
  });
```

4. Imports: move the digest's `Effect.promise` use here; do not add a hash error type. Keep this procedure local to aggregate admission; do not introduce shared hash strategy options or change service admission.
5. Tests: assert fixed digest fixtures for nested full claims and arrays, equal hashes for reordered object-key insertion, distinct hashes for changed non-partition claims or array order, and existing serialization/digest failure behavior. Use the production admission procedure and expected legacy bytes; do not test a copied implementation as the oracle.

### Resulting parent

1. Proposed complete file follows. Keep the original export, props, root span, inline availability failures, log acquisition, and lazy result assembly. All admission phases execute inside the single audited program; the extracted procedures do not run runtimes themselves.

```ts
import type { IAggregateAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import config from 'config';
import { Effect } from 'effect';

import { SystemLogRepo } from '../../../SystemLogRepo/SystemLogRepo.js';
import { auditAggregateAdmission } from './utils/auditAggregateAdmission.js';
import { authenticateAggregateClaims } from './utils/authenticateAggregateClaims.js';
import { hashAggregateAdmissionClaims } from './utils/hashAggregateAdmissionClaims.js';
import { makeAggregateActorSelection } from './utils/makeAggregateActorSelection.js';

const { system } = config;

/**
 * Authenticate one aggregate version with an independent durable audit attempt.
 *
 * 1. Resolve the requested aggregate and actor version.
 * 2. Capture authentication and acquire the system log.
 * 3. Audit authentication, canonical partition selection, and full-claims hashing.
 */
export const admitAggregate = Effect.fn('AggregateApi.admitAggregate', {
  root: true,
})(function* (props: {
  aggregateName: string;
  aggregateVersion: string;
  actorName: string;
  actorVersion: string;
  request: IAggregateAdmissionRequest;
}) {
  // 1 — resolve the requested aggregate and actor version before creating an attempt
  const aggregateRelease =
    system.aggregates[props.aggregateName]?.[props.aggregateVersion];
  if (aggregateRelease === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'identity-aggregate-unavailable',
        message: 'The requested aggregate version is unavailable',
      }),
    );
  }
  const actor = aggregateRelease.actors[props.actorName];
  if (actor === undefined || actor.version !== props.actorVersion) {
    return yield* makeZerospinError('actor-version-unsupported');
  }

  // 2 — retain pre-attempt acquisition and authentication capture
  const authentication = actor.authentication;
  const systemLogRepo = yield* SystemLogRepo.getRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID },
  });

  // 3 — require audit settlement before returning the completed admission
  return yield* auditAggregateAdmission({
    systemLogRepo,
    aggregateName: props.aggregateName,
    aggregateVersion: props.aggregateVersion,
    program: Effect.gen(function* () {
      const { claims, encodedClaims } = yield* authenticateAggregateClaims({
        actor,
        authentication,
        request: props.request,
      });
      const { selection, actorPath } = yield* makeAggregateActorSelection({
        identity: actor.identity,
        claims,
      });
      const claimsHash = yield* hashAggregateAdmissionClaims({
        claims: encodedClaims,
      });
      return {
        claims: encodedClaims,
        claimsHash,
        selection,
        actorName: actor.name,
        actorVersion: actor.version,
        actorPath,
        systemName: system.name,
      };
    }),
  });
});
```

### Planned hierarchy

1. `+` creates; `~` modifies. Documentation changes occur after source implementation, using verified new source spans and hashes.

```text
zerospin/
├── packages/system-worker/
│   ├── src/AggregateApi/admit/admitAggregate/
│   │   ├── ~ admitAggregate.ts
│   │   └── + utils/
│   │       ├── + auditAggregateAdmission.ts
│   │       ├── + authenticateAggregateClaims.ts
│   │       ├── + makeAggregateActorSelection.ts
│   │       └── + hashAggregateAdmissionClaims.ts
│   └── checks/
│       └── ~ aggregate-administration.mjs
├── explorer/src/data/sequence-call-trees/
│   └── ~ browserSteps.ts
└── wiki/
    ├── architecture/
    │   ├── ~ AuthoredSystem.md
    │   └── browser/
    │       └── ~ Identity.md
    └── plans/
        └── ~ 069-plan-rpc-call-stack-cleanup.md
```

### Implementation order

1. Re-read the selected source and relevant concurrent changes before implementation. Retain the explicit aggregate-ID admission API; do not restore historical credentials-only behavior or revert adjacent parent-thread work.
2. In one coherent source change, create all four procedure files, switch the parent to direct imports and the complete proposed flow, add numbered phase comments, and remove the moved inline implementations and unused imports. Keep lookup and log acquisition outside the audited program. Do not retain both implementations or a temporary compatibility path.
3. Extend the existing admission checks for gaps identified above. Keep the current parent-owned `SystemLogRepo.getRepo` fixture seam; the audit procedure's type-only import requires no runtime mock or additional global fixture mechanism. Add an explicit compile-time assertion of the unchanged admitted value, failure union, and remaining service requirements if emitted declarations reveal a change.
4. Run the worker graph with its real dependency builds. Correct only refactor-caused failures; distinguish unrelated concurrent failures in recorded evidence. Reconcile the affected architecture citations and Explorer admission links with the final source, then run their scoped checks.
5. Format only touched files, review the scoped diff, and record exact results here. This refactor introduces no glossary term or qualifying ADR; reconcile existing admission language only if it no longer matches. Keep Plan 069 active and stop before selecting another RPC method.

### Verification

1. Run the configured worker tasks together so Nx can coordinate their shared dependency builds:

```sh
NX_DAEMON=false pnpm nx run-many -t ts,lint,aggregate-administration:check,authorization-provisioning:check -p system-worker
```

2. Verify unchanged emitted admission types and outer-capability behavior: decoded/encoded claims and string selection remain precise, the existing metadata fields survive, no custom promise-execution service is required, and failures retain the local/remote union. No cast, public schema/export change, or consumer fallback is permitted.
3. The administration fixture must cover phase ordering, strict decoding, requested-ID mismatch, partition reversibility, exact claims hashes, begin and completion failures, original non-interruption Causes, and unfinished pure/mixed interruption. The real authorization-provisioning fixture verifies production admission still grants no capability before durable completion and does not disturb authorization-owned provisioning.
4. After updating Explorer source references and architecture citations, run its configured tasks:

```sh
pnpm nx run-many -t source:check test:diagrams build check -p explorer
```

5. Scope formatting to the actual changed files, using the repository formatter. This is an implementation-time command, not a planning action:

```sh
pnpm exec oxfmt packages/system-worker/src/AggregateApi/admit/admitAggregate/admitAggregate.ts packages/system-worker/src/AggregateApi/admit/admitAggregate/utils/auditAggregateAdmission.ts packages/system-worker/src/AggregateApi/admit/admitAggregate/utils/authenticateAggregateClaims.ts packages/system-worker/src/AggregateApi/admit/admitAggregate/utils/makeAggregateActorSelection.ts packages/system-worker/src/AggregateApi/admit/admitAggregate/utils/hashAggregateAdmissionClaims.ts packages/system-worker/checks/aggregate-administration.mjs explorer/src/data/sequence-call-trees/browserSteps.ts wiki/architecture/AuthoredSystem.md wiki/architecture/browser/Identity.md wiki/plans/069-plan-rpc-call-stack-cleanup.md
```

6. Finish with scoped `git diff --check`, review the affected source/documentation diff, and search the owning folder for duplicated inline algorithms, moved error messages, new casts, barrels, or bypassed envelope consumption. No Shopping browser verification belongs to this refactor.
7. Planning verification: current source, callers, identity/authentication types, audit repository procedures, relevant fixture cases, and actual worker/Explorer task configurations were inspected. All nine TypeScript snippets passed read-only syntax parsing, and the plan passed scoped `git diff --check`. Proposed snippets have not been typechecked or executed; record implementation results separately.

### Expected metrics and decisions

1. Measured from the complete proposed snippets, before repository formatting: parent declaration 61 lines instead of 228; parent file 82 lines instead of 245. The parent retains only its two availability `if` statements and one nested admission generator. Exact final sizes depend on formatting and annotations.
2. Total proposed production source across the parent and four new files: 383 lines. Imports, narrow props, exported generator return contracts, and phase comments increase total lines while separating four real invariants. The refactor reduces parent responsibility and nesting; it does not remove security checks or claim a reduction in total branch complexity.
3. All selected phases appear once in the extraction map. No procedure merely forwards one call. Audit start and settlement stay together; authentication and claims stay together; canonical partition checks stay together; recursive serialization and digest stay together.
4. Unresolved behavior choices: none. Implement the retained behavior described here. Any proposal to alter completion-failure precedence, interruption settlement, claims hashing, authentication inputs, or partition normalization is a separate design change and must be discussed before expanding this iteration.
5. Remaining work for Iteration 3: none. Source extraction, fixture coverage, admission documentation, final worker verification, emitted-type assertions, and all Explorer checks passed. Stop before beginning the next RPC iteration.

## Iteration 4 — Direct aggregate command admission — 2026-10-09

1. Status: complete on 2026-10-09. Direct admission, caller replacement, behavioral checks, and affected documentation are implemented and verified. During Iteration 3 the user explicitly requested removing `prepareAdmission` and `resolveAggregateCommandContext.ts`, with release/actor/contract lookups composed at their owners.
2. `admitAggregateCommands` performs submission validation, admission outcome recording, and synchronous atomic retention directly. AggregateChain RPC methods hold their producer lease around the complete synchronous admission procedure; no separate preparation API or replacement context object remains.
3. Admission owns submission authority: exact source release/actor agreement, strict actor claims and aggregate identity, ordinary owner and agent contract bindings, system session restrictions, and trusted continuation ownership. Original execution-version pinning, repeat recovery, staging refusals, and external production evidence remain intact.
4. Staging and preview first verify the complete bound session identity, then use explicit contract/claims lookups. Forged bindings now fail with the existing projection-mismatch error rather than the unrelated provenance resolver error. Execution separately looks up immutable source and execution contracts and retains lineage and external-response checks. Historical actor resolution remains only where external emission ownership differs from actor provenance.
5. Narrow `checkAdmission` to one looked-up contract, removing owner-array scanning and its separate `prepareAdmissionResult` wrapper. Its service admission caller is updated directly; service admission architecture is otherwise outside this iteration.
6. Scope: the deleted resolver and its four callers; AggregateChain admission/RPC compositions; the shared admission validation helper and its service caller; existing administration checks and affected architecture/Explorer references. No storage reset, schema change, publication, or next RPC selection is authorized.
7. Verification: the same worker and Explorer task graphs required by Iteration 3, with existing authority, version replay, async emission, duplicate recovery, fanout lease, interruption, and rollback fixture coverage adapted to real admission.

### Implementation evidence — 2026-10-09

1. Iteration 3 now has an 83-line parent (61-line exported declaration) and four direct procedure imports. The audit retains protected writes, complete-Cause propagation, unfinished interruption, and completion-failure precedence. No new storage schema, cast, barrel, public export, glossary term, or qualifying ADR was introduced.
2. Preserve the concurrent arbitrary-string aggregate-ID cutover in `AggregateAdmissionRequestSchema` and `authenticateAggregateClaims`; it occurred outside this extraction. The planned `acct` decoder reflects the earlier baseline, not the final current source. Request/claim ID agreement remains enforced.
3. Iteration 4 deletes `resolveAggregateCommandContext.ts`, `prepareAdmission`, and `prepareAdmissionResult`. The shared validation helper accepts a looked-up contract. Admission owns submission permissions; execution consumes admitted occurrences and preserves independent source/execution lineage. Staged actor repeats retain the original duplicate-before-ordinary-contract-refusal ordering.
4. Existing administration checks now exercise production admission, audit order and settlement, whole Causes, telemetry, codec round trips, fixed full-claims hashes, serialization/digest failures, bound projection identity, strict claims before duplicate recovery, mapped-agent preview, frozen continuation ownership, and producer interruption/rollback.
5. The final worker graph passed all four checks together: `ts`, `lint`, `aggregate-administration:check`, and real `authorization-provisioning:check`, including the final staged duplicate-order restoration. The concurrent SystemRepo router wiring errors were resolved by their owning work. Worker lint passed with existing curly warnings; Nx Cloud remote-cache 401 messages did not prevent local checks.
6. Emitted admission parameter/success/service equality and both directions of public local/remote failure assignment passed against the saved baseline and final worker declarations. The new declaration uses the existing public failure aliases rather than expanding recursive JSON. Explorer typecheck and all 27 RPC checks passed. The remaining lint, diagram, and formatting checks passed after the two existing router references were corrected; all 16 diagram tests pass.
7. Updated admission architecture and Explorer trees with checked source spans/hashes; the execution sequence has nine messages and nine annotations. Scoped formatting and diff review passed, and no removed resolver/preparation name remains in production or the administration fixture. The user authorized completing the remaining verification, including two mechanical Explorer links to the concurrently moved router: forwarding at `makeSystemRepoRouter.ts:335` and aggregate ticket consumption at line 255. Router source was preserved. The parent plan remains active.

## Iteration 5 — Inline redundant file-scoped functions — 2026-10-09

1. Status: complete on 2026-10-09. The approved cleanup removes 42 private helpers across 36 owning production files in system-worker, browser, core, react, live-query, logger, shapes, cli, devtools, and studio. The aggregate admission caller is the 37th changed source file.
2. Export the existing aggregate admission transaction directly as `admitAggregateCommandsTx`, preserving the concurrent file and method rename. Keep the empty-batch guard and transaction error mapping in `admitAggregateCommands`. Inline other transaction programs, workflow wrappers, constructor-only factories, and simple callbacks at their existing consumers.
3. Preserve transaction boundaries, domain failures, trace names, hook order, public overloads, and generic service inference. Metadata returns use the existing raw Drizzle row types; queue fields retain all inferred factory capabilities. Retain reused helpers, recursion, type guards, and coherent parsing algorithms. No schema, compatibility, cast, glossary, ADR, publication, or next RPC change belongs to this iteration.
4. The ten-project Nx graph passed `ts`, `lint`, core/browser `test:node` (32 + 67 tests), worker `aggregate-administration:check` and real `outbox:check`, and React `claims:check`, with dependency builds and caching retained. The first graph exposed a queue row-inference mismatch; explicit factory generics preserved the original narrow exposed row type and all queue capabilities, and the final graph passed. Existing lint warnings and Nx Cloud remote-cache 401 messages did not prevent local verification.
5. Reconciled changed source hashes and ranges in eleven affected architecture pages and updated four Explorer data files. Removed helper names now describe the inline transactions; aggregate admission has one transaction node, while its empty guard and error mapping cite the caller. Explorer `typecheck`, `lint`, `rpc:check`, `test:diagrams`, and `format:check` all passed.
6. Changed-file formatting passed across 49 production/documentation/plan files, and Explorer formatting passed separately. Verified 55 changed-source hash entries and 42 source citation ranges. Scoped diff review and `git diff --check` passed; all 42 removed declarations are absent, and AST comparison across the 37 changed source files confirms no new casts or `ALLOWED_CAST`. Preserve the concurrent aggregate-admission rename and unrelated WIP, including separately authored plans. This routine refactor introduces no glossary term or qualifying ADR.
7. Remaining work for Iteration 5: none. Keep Plan 069 active for its remaining RPC queue and stop before selecting another method.

## Iteration 6 — RPC boundary schemas and tidy orchestration — 2026-10-11

### Status and governing shape

1. Status: implementation and required scoped verification complete on 2026-10-11. The scheduled 02:00 America/Chicago kickoff implemented this bounded batch and the agreed strict simplicity review. The later complete framework review covers the separate source-review queue; this parent loop is now archived.
2. Follow the [Ideal method shape](../../../AGENTS.md#ideal-method-shape): **a completed method reads top to bottom as inputs, named domain steps, and a result. Each procedure owns meaningful work. Validation happens once at its owning boundary, and transport plumbing surrounds the workflow once.** Preserve required ordering, synchronous transactions, permits, tracing, and capability lifetimes.
3. Destructure props bags once at entry, or after/as part of the boundary schema decode. Pass cohesive commands, deliveries, claims, and owner keys intact. Avoid dismantling domain values merely to rebuild them for the next procedure. Remove redundant aliases, repeated props reads, and unchecked props spreading; use explicit fields to distinguish caller inputs from retained owner dependencies.
4. The owner inventory below bounds coverage. It does not authorize a directory-wide rewrite: change the audited entrypoints and only their supporting props-bearing procedures/callbacks that need the agreed cleanup or validation relocation. Keep substantive workflows behind named domain procedures. No new schema factories, decoder wrappers, prepared objects, validation framework, compatibility paths, casts, or test/check files, fixtures, runners, or configuration.
5. Apply aggregate actor/agent and projection edits against the surviving design recorded by completed [plan 101](101-plan-remove-aggregate-server-staging.md). Exclude AggregateSessionRepo, server staging, staged ingress, and remote validateActorCommand. Preserve concurrent [browser lifecycle work](100-plan-unified-browser-session-lifecycle.md) and Channel work; their implementation and verification remain with their owning chats. This batch changes no fixed storage schema and adds no AGENTS.md rule.

### Boundary ownership and props inventory

1. Generated public APIs own caller-shape decoding. Keyed Repos retain authored-schema, claims, permission, storage, provenance, and state-transition checks. Repo entries below receive props cleanup, not another public API schema decode. Independently identified admission, delivery, browser, and Studio receivers validate their own transport inputs.
2. Keep scalar and optional call shapes, parameterless methods, capability getters, and lifecycle hooks. Do not invent props envelopes or decorative destructuring. Keep existing command/projection data, payload strings, and producer evidence unchanged where exact comparison requires them.

| Owners                                                                                                                        | Audited entrypoints and supporting scope                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GatewayApi, SystemApi, AggregateApi, ServiceApi, AggregateAccessApi, ServiceAccessApi, AggregateSessionApi, ServiceSessionApi | Existing decoded method bodies; immediate admission/authorization/resource procedures that still read or forward props. Destructure supplied tuples/fields before yielding services. Failure capabilities only replay retained failures. |
| SystemRepo                                                                                                                    | Both session-ticket methods, checkSystemSpec, registerRepo, getAggregateIds, hasAggregate, getRepoRegistrations; corresponding procedures and existing spec acceptance/initialization props cleanup.                                     |
| SystemLogRepo                                                                                                                 | Begin aggregate/service admission attempt, completeAdmissionAttempt, appendLogRow, appendTelemetryBatch, getSystemLogRows, getBackendError; corresponding procedures and telemetry transaction.                                          |
| AggregateChain / ServiceChain                                                                                                 | Ordinary/async admission and their receivers, direct aggregate execution, executeCommandsThrough; existing admission/execution transactions. Preserve already completed aggregate boundary parsing.                                      |
| AggregateVersionRepo / ServiceVersionRepo                                                                                     | Prepared-command retrieval, replay subscriber binding, awaitCommandResult, flush, query, session authorization; supporting progress/materialization, command execution and replay procedures.                                            |
| ServiceActorVersionRepo / surviving AggregateActorVersionRepo and AggregateAgentVersionRepo                                   | Source-bound subscriber construction, catchup, snapshot; supporting projection reception, readiness, output queues and shared aggregateProjection procedures.                                                                            |
| makeDORepo                                                                                                                    | getRepoTableRows and its procedure; allowed-table membership remains owner-local.                                                                                                                                                        |
| Generic subscriber/queue factories, three browser families, StudioAgentApi                                                    | The independent boundaries listed in the implementation steps below and their existing typed domain procedures.                                                                                                                          |

### Implementation

1. **Repair API envelope parsing.** Keep rpcMethod's global strict decoder. Use StructWithRest with a Record(String, Unknown) rest schema in rpcRequestSchema to accept outer envelope extras while retaining strict argument tuples/structs. Preserve the existing transformation supplying only decoded args, permissive trace-context handling, telemetry and outcome callbacks. Keep one explicit codec return type on this helper to preserve the precise public encoded interface; retain inference elsewhere. Remove ineffective parseOptions annotations. In both AccessApi parse-error classifiers, use strict decodeUnknownOption for the outer shape on the failure path only, preserving argument versus lock error codes.
2. **Move service wire validation once.** In ServiceChain.admitServiceCommands, decode the inline commands Struct using EncodedServiceCommandSchema before array access, permits or writes, and use its decoded commands directly. Remove the duplicate Schema.encodeEffect(EncodedServiceCommandSchema) from the shared admission loop: the schema has no encoding transformation. Keep response normalization, but pass the unnormalized typed input to checkAdmission so its absent response stays absent. Retain version availability, actor authority, duplicate comparisons, retained-row decoding and admitServiceCommandsTx. In async admission, validate the rows envelope using ownerVersion:String and AsyncCommandSchema while preserving original props through Effect.as(props) for producer-proof comparison. After verification returns the reconstructed service command, remove ownerKind before shared admission. Reconstruction already validates its service shape. Preserve whole-page producer verification before taking the permit, empty batches and existing outbox coordination. Destructure managedRuntime and other dependencies at the top of supporting procedures.
3. **Validate generic delivery containers.** Server OutboxSubscriber.receive validates Array(Unknown); FanoutSubscriber.receive validates rows:Array(Unknown) and lastIndex:nonnegative safe integer. These checks validate containers, not domain rows. Forward the original typed delivery/rows to the owner, preserving payload and producer evidence. Ignore envelope extras. Keep owner row/operation validation, exact equality, hashes, contiguity and transactional commit semantics. Put parsing and owner execution within the existing named trace and one RPC envelope; add no row-schema configuration or new forwarding layer.
4. **Validate queue/cursor inputs before work.** FanoutSubscriber.catchup/subscribe accepts undefined or a nonnegative safe integer. FanoutQueue.getPage validates required afterIndex and optional maxIndex with the same integer constraints. Preserve zero, omitted fields and the existing empty suffix when maxIndex is below afterIndex. Move the caller index guard out of runFanoutCatchup; retain its source-response/history/progress checks. Parse before callback, acquisition, alarm hold or SQL.
5. **Declare subscriber identity once per queue.** Add `subscriberKeySchema: Schema.Codec<NoInfer<MatchParams<PATTERN>>>` to makeFanoutQueue. Supply the five direct Structs below, all fields Schema.String. In subscribe, decode the key and nullable nonnegative safe currentIndex with two direct decodes against the same input, ignoring extras, then enroll the decoded key plus cursor. resumeSubscriber decodes the key before recovery. Keep name creation, owner-key equality, transactions and failure recovery with their existing owners. Name encoding coerces values to strings, so a name roundtrip cannot validate input types. Retain the two decodes: composing a generic Codec's fields would introduce unnecessary generic machinery or casts.
6. **Move browser parsing into receiving classes.** Move each existing, distinct attachment schema into its SharedWorkerApi boundary; pass decoded inputs to the runtime/attach procedure before provider duplication or owner attachment. Share one concrete BrowserSessionSubscriptionSchema (`afterNodeIndex` is an optional nonnegative safe integer) and one concrete BrowserSessionPushPausedSchema (`pushPaused` is a required Boolean) across the three families. Preserve existing strict excess-property rejection for browser attachment, subscription, pause and outbox inputs. Each BrowserSessionApi decodes/destructures subscribe/pause input, then calls the existing typed procedure. Remove subscription-manager and pause-helper parsing. Preserve existing access checks before parsing and around asynchronous work; invalid subscriptions leave the current sink alive. Keep attachment cleanup, sink replacement, late-acquisition release, privacy gates and Node cursor/domain checks in their named owners. For browser outbox, build Array(schema) once in its existing factory and validate the complete page in the generated receiver before acceptance. Keep encoded row schemas, node-command-invalid, check/receive/check ordering and one envelope. Browser malformed attach/subscribe/pause input remains in its existing defect channel; RpcStub arguments and positional signatures stay unchanged.
7. **Validate Studio and complete mechanical cleanup.** StudioAgentApi locally decodes/destructures aggregateName:String and aggregateVersion:String before credential-backed calls, ignoring extras and reusing system-api-arguments-invalid. Retain the existing telemetry envelope/final flush and authenticated capability acquisition procedure. Complete the bounded props cleanup across the owner inventory. Remove only the six forwarding files listed below; preserve meaningful owner procedures and their sequencing.

| Queue declaration                     | Required subscriber identity fields                             |
| ------------------------------------- | --------------------------------------------------------------- |
| AggregateChain replay                 | systemId, aggregateId, aggregateName, aggregateVersion          |
| ServiceChain replay                   | systemId, serviceName, serviceVersion                           |
| AggregateVersionChain actor results   | Aggregate replay fields plus actorName, actorVersion, actorPath |
| AggregateVersionChain agent results   | Aggregate replay fields plus agentName, agentVersion            |
| ServiceVersionChain execution results | Service replay fields plus actorName, actorVersion, actorPath   |

### Explicit removals, retained procedures and public failures

1. Delete only these six forwarding files after their tracing/envelope work moves to the actual receiving method: system-worker makeOutboxSubscriber/receive.ts, makeFanoutSubscriber/receive.ts, makeFanoutQueue/getPage.ts, makeFanoutQueue/subscribe.ts, makeFanoutQueue/resumeSubscriber.ts; browser outbox/receive.ts. Update their imports and direct callers. This is not permission to flatten other helpers or broaden no-input-method cleanup.
2. Retain browser attach, subscribe, makeBrowserSessionSubscription, receiveCommandRows and pause persistence/background-push procedures; Studio getAgentAggregateIds; fanout subscription and runFanoutCatchup; owner query progress/permits, authorization, admission/provenance, execution/replay, projection reception, transaction and result-recovery procedures. Move their wire parsing out; preserve their cohesive domain/lifetime work and destructure typed props first.
3. Use existing mapParseError with a readable method-specific prefix. Preserve callback/domain errors, trace names, telemetry and single envelope conversion. Propagate the four new framework input codes through capability failure unions and existing explicit caller annotations; preserve callback option signatures and public encoded call shapes. Keep fanout-catchup-index-invalid in ICatchupBoundaryError after moving its guard and update explicit fanout PAGE_ERROR annotations in both VersionRepos, ServiceActorVersionRepo and aggregateProjection/types.ts.

| Parse failure                                  | Code                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Server outbox array / fanout delivery          | New outbox-delivery-invalid / fanout-delivery-invalid             |
| Fanout page / enrollment cursor                | New fanout-page-invalid / fanout-subscriber-index-invalid         |
| Fanout subscriber cursor / subscriber identity | Existing fanout-catchup-index-invalid / repo-key-encode-failed    |
| Service ordinary / async admission             | Existing service-admission-encode-failed / async-admission-failed |
| Browser outbox / Studio arguments              | Existing node-command-invalid / system-api-arguments-invalid      |

### Planned hierarchy

Legend: + create, ~ modify, - delete. Directory entries identify the bounded owner inventory above; only required methods, supporting procedures, types and affected documentation change.

```text
zerospin/
├── packages/system-worker/src/
│   ├── ~ makeRpcApi/
│   ├── ~ {GatewayApi,SystemApi,AggregateApi,ServiceApi}/
│   ├── ~ {AggregateAccessApi,ServiceAccessApi,AggregateSessionApi,ServiceSessionApi}/
│   ├── ~ {SystemRepo,SystemLogRepo,makeDORepo}/
│   ├── ~ {AggregateChain,ServiceChain,AggregateVersionChain,ServiceVersionChain}/
│   ├── ~ {AggregateVersionRepo,ServiceVersionRepo,ServiceActorVersionRepo}/
│   ├── ~ {AggregateActorVersionRepo,AggregateAgentVersionRepo,aggregateProjection}/
│   ├── ~ {makeOutboxSubscriber,makeFanoutSubscriber,makeFanoutQueue}/
│   ├── - makeOutboxSubscriber/receive.ts
│   ├── - makeFanoutSubscriber/receive.ts
│   └── - makeFanoutQueue/{getPage,subscribe,resumeSubscriber}.ts
├── packages/browser/src/
│   ├── ~ {AggregateNode,ServiceNode,StandaloneNode,Node,outbox}/
│   ├── + Node/BrowserSessionSubscriptionSchema.ts
│   ├── + Node/BrowserSessionPushPausedSchema.ts
│   └── - outbox/receive.ts
├── packages/studio/src/
│   └── ~ StudioAgentApi/
└── wiki/
    ├── ~ plans/069-plan-rpc-call-stack-cleanup.md
    ├── ~ patterns/{apis,rpc,schemas}/ — affected examples and ownership rules
    └── ~ architecture/ — affected workflows and source citations
```

### Verification and completion

1. Verify outer RPC envelope extras succeed while nested argument/direct-request extras fail; AccessApi classifications stay distinct, opaque credentials/payloads retain their policy, and public encoded types/service inference remain unchanged.
2. Exercise malformed containers, missing/nonstring identity fields and negative, fractional, unsafe or nonfinite cursors. Refusals precede side effects; zero, undefined cursors, nullable enrollment cursors and bounded empty pages remain valid. Domain rows still reach their owner's validation unchanged.
3. Verify service ordinary commands have one wire-schema pass; absent response reaches checkAdmission unchanged; payload strings and retry identity retain their values. Async proof compares original delivered objects before metadata removal. Verify producer mismatch, duplicate recovery, authorization and synchronous rollback/retention at existing production seams. Keep stored-row and state-transition checks distinct from moved wire parsing.
4. Verify invalid subscriptions preserve their sinks; replacement, late acquisition, attachment failure and disposal release retained capabilities once. Preserve detached/signed-out precedence, privacy gates, complete-page validation before acceptance, pause/unpause and Studio refusal before network calls.
5. Run one scoped Nx graph for applicable lib, ts and lint targets on system-worker, @zerospin/browser and @zerospin/studio with dependency scheduling and caching retained; finish changed-file formatting and diff checks. Use available existing seams and disposable inline probes; add no test/check artifacts or fixtures. Record coverage limitations and unrelated blockers without widening repair scope.
6. Review final method bodies against the governing shape, the explicit keep/delete list and the bounded inventory. Remove superseded parsing/imports/aliases, verify shared browser schemas and ensure no new props/preparation/type ceremony replaces deleted glue. Reconcile affected READMEs, examples and architecture citations after implementation. Reconcile glossary terminology only if a domain concept was implemented; create an ADR only for an implemented decision meeting all repository criteria.
7. Record actual implementation/check evidence here. Keep this iteration pending while required work remains. Completing this mechanical boundary batch does not complete the separately pending full call-stack reviews or justify archiving parent plan 069.

### Implementation and verification outcome

1. Implemented the bounded owner inventory on the surviving source. Plan 100 is archived complete, Plan 103 is archived complete, and Plan 101 has complete source/scoped/runtime checks while awaiting its separate Channel completion condition. Plan 099 source and compilation gates are complete with independent runtime work pending. No changes or messages were sent to those owning chats. Existing aggregate direct admission/projection, unified SystemLogRepo.beginAdmissionAttempt, SystemRepo.acceptSystemSpec and consolidated SystemApi inspection signatures remain in use.
2. API envelope parsing now uses StructWithRest and one precise explicit Codec return type. Global argument decoding remains strict, Access failure classification uses strict decodeUnknownOption, and decoded API tuples/fields bind before service acquisition. Keyed Repos receive bounded props cleanup while retaining authored-schema, authority, progress, persistence and transaction checks. Service ordinary admission consumes one decoded wire page, preserves absent response for checkAdmission, and normalizes only the retained/comparison command. Async ingress preserves original delivery evidence, proves the whole page before permits, and removes ownerKind only from verified reconstruction. The shared verifier has only the two already validated Chain callers; it accepts typed IAsyncCommand and no longer repeats the wire decode.
3. Generic receivers validate containers and forward original domain data. Queue/page/cursor schemas, the five concrete subscriber identity Structs, four input failure codes and caller annotations are wired. All six listed forwarding files are deleted; no additional source deletion was introduced by this iteration. Browser attachment/subscription/pause decoding is in receiving classes and typed lifetime procedures remain. The two concrete shared browser schemas preserve Plan 103's added pendingCommandIds subscription field. StudioAgentApi had already been removed by Plan 103: the surviving HTTP broker already validates NonEmptyString identity fields with strict extras before authenticated acquisition, so its stricter studio-request-invalid policy was preserved and verified rather than recreating the deleted capability.
4. Actual-source API probes passed outer-extra acceptance, strict nested arguments and tuple/type refusal before the body, once-decoded transformations, permissive trace/noargs behavior, and both Access classification paths. In-memory compiler assertions passed exact args/traceContext encoded keys, mutable tuple shape, generated request signatures, domain success inference and the existing getAgentAggregateIds signature. These probes supplied platform/config/acquisition bindings; they do not claim durable network execution.
5. Actual generic subscriber factories refused 28 malformed inputs, preserved original arrays/deliveries/rows, accepted zero/omitted cursors and released three acquired capabilities exactly once. Actual fanout queue plus sql.js/Drizzle refused 27 malformed page/key/enrollment requests before readers, alarms or writes; zero/omitted bounds, maxIndex below afterIndex, null/zero enrollment and retained owner mismatch passed.
6. Actual browser receiving classes and real MessagePort RPC passed all three families' valid subscriptions with pending IDs/cursor zero, malformed replacements preserving the live sink, sanitized Worker RPC failed defects, positional RpcStub sink delivery and disposal/access precedence. Direct production-class probes cover malformed cursors/IDs/extras, privacy gates, sink replacement, late acquisition, pause/unpause and attachment provider cleanup. Outbox probes passed whole-page refusal before acceptance, unchanged payload strings, access checks and one completed trace/envelope. The surviving Studio broker rejected four invalid requests before credentials/network and reached acquisition for valid input. Instrumented owner callbacks establish boundary/lifetime behavior; full native SQLite/authentication/SharedWorker UI execution was not run.
7. Service probes used the actual receiving method bodies, production admission/transaction/proof procedures, existing Shopping release and real sql.js/Drizzle. Seven malformed ordinary and five malformed async inputs refused before permits/writes. Absent response policy, exact payload strings, duplicate recovery, explicit-response and forbidden-actor refusals, retained actor claims/Node submission identity, late synchronous rollback, unexpected producer evidence, whole-page proof before permits, ownerKind removal and async retry passed. Evidence: /tmp/zerospin-iteration6-service-probes.json. The method bodies use injected runtime/dependencies and the recorded expected producer object was supplied; this is not a new Workerd, authentication or remote-producer run. An initial manual probe supplied invalid null telemetry; it was corrected to a valid RPC envelope and all producer-proof assertions passed.
8. Final scoped graph: pnpm nx run-many --targets=lib,ts,lint --projects=system-worker,@zerospin/browser,@zerospin/studio --parallel=1 --skipSync --outputStyle=static passed all 20 tasks including dependencies. Dependency scheduling and caching were retained; --skipSync preserves existing reference configuration. Evidence: /tmp/zerospin-iteration6-nx-final.log. Initial optional-cursor, declaration-name, failure-union and overloaded-envelope inference errors were resolved. Introduced shorthand/import warnings were fixed; final lint reports no findings. Nx Cloud 401 is ancillary to the successful local graph.
9. Independent source review checked ordinary response policy, async proof, transaction/permit/progress order and surviving projection ownership. Two missed pre-service destructures and the duplicate async decode were removed. Required source shape/reference and whitespace checks passed; scoped Oxfmt checked 228 files. Final architecture validation passed 526 source metadata entries, 489 source citation ranges and 865 relative links across twelve affected pages. Relevant READMEs, schema/RPC examples and architecture source metadata/citations now identify the receiving classes and surviving procedures. No new tests, fixtures, check runners, cast exceptions, schema framework, fixed storage change, compatibility path, commits, publication or deployment were introduced.

### Remaining work for Iteration 6

None for the bounded implementation and required scoped verification. Coverage limits remain recorded above. The parent review loop is closed by this archival.

## Archival outcome — 2026-10-11

1. The user explicitly requested archival after the source-review queue was confirmed covered by the [complete framework review](../../reviews/2026-10-11-framework-rearchitecture.md). The original per-method loop is closed. Completed iterations and their recorded coverage limits remain historical evidence.
2. Continuing aggregate admission work belongs to [Plan 102](102-plan-aggregate-command-admission-orchestration.md). Other ownership changes belong to the review's [named implementation plans](../../reviews/2026-10-11-framework-rearchitecture.md#plans-and-ownership) and shared implementation order. Their implementation and verification remain independently pending; do not revive this queue alongside replacement designs.
3. QRK migration/publication remains separately scoped and unperformed by this plan. Preserve its requirements in the [QRK follow-up](#qrk-follow-up--separately-scoped); this archival does not authorize work in that repository or package publication.
4. The companion RPC cleanup handoff is archived with this plan because its receiving context has been superseded. Other active plans and their verification requirements retain their own status.

## Remaining work

None in this archived plan. Continuing work is recorded with the owners above.
