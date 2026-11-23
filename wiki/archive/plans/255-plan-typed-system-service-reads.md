# 255 — Typed SystemApi service reads

Status: Archived on 2026-10-22 at the maintainer's request after handing off the remaining work. The common typed SystemApi rectification is implemented, published as **29.0.1**, integrated and committed in the producer and all five sibling consumers. HTTP and native acquisition use the shared typed interface; the exported selection helper is deleted. Its compiler, 66 integrated runtime tests, all 18 package library builds and scoped consumer checks pass. The maintainer has now approved both hard cutovers. Source declarations, local catalogue cutover and contained verification are complete. Cloud development API activation is recorded in [archived Cloud Plan 027](../../../../zerospin-cloud/wiki/archive/plans/027-plan-three-model-control-plane-hard-cutover.md); remaining Cloud verification is deferred in the [Cloud TODO](../../../../zerospin-cloud/TODOS.md#cloud-verification-deferred) and [handoff](../../../../zerospin-cloud/wiki/handoffs/027-handoff-three-model-control-plane-hard-cutover.md). No architecture decision is outstanding. Producer 29.0.2 subsequently landed for an independent staged-command startup fix; Red Rope adopted that release separately and retains unrelated lockfile WIP.

Hard-cutover approval, 2026-10-22: the maintainer selected a hard cutover for removed `service.queries` in every relevant repository and for the old Agent Backend Node ownership. This settles the earlier strategy decision. Use empty affected catalogue storage and fresh SQLite namespaces for the new Agent Node classes, with no old decoder, field stripping, class rename, identity translation or compatibility alias. Preserve unrelated resource/history stores and historical Cloudflare migration entries. The exact local execution and remaining deployed-state scope are recorded below; remaining provider credentials and acceptance/recovery work is owned by the [Cloud TODO](../../../../zerospin-cloud/TODOS.md#cloud-verification-deferred), with implementation evidence in archived Cloud Plan 027.

Rectification, 2026-10-22: the maintainer **FORBIDS adding `ownerKind`, EVER** and selected option 2: native callers use the typed SystemApi interface. Delete `executeQuerySelectionRpc` and its export. Selection preparation, result validation and row mapping belong inside the typed administrative methods; do not export replacement selection helpers or recreate the domain switch under another name. This supersedes both the original generic executor and the proposed pair of exported selection procedures. The rule is recorded in [AGENTS.md](../../../AGENTS.md).

Red Rope update, 2026-10-22: the maintainer requested a clean-slate domain redesign and selected a private fleet per person. [Red Rope Plan 022](../../../../redropeparking/wiki/archive/plans/022-plan-fresh-zerospin-ownership.md) replaces this plan's former invitation-read substitution. Enrollment will decide admission through commands and record a grant to the independently owned fleet. Named-query removal and typed administrative reads remain approved; Red Rope's exact destructive cutover scope remains separate.

## Closure — 2026-10-22

1. The shared typed SystemApi implementation, publication, consumer adoption and
   contained verification are complete, as recorded below. The exported selection
   helper and named service query registry are removed.
2. Cloud's remaining hosted/runtime and provider verification is deferred in the
   [Cloud TODO](../../../../zerospin-cloud/TODOS.md#cloud-verification-deferred),
   with pickup context in the
   [Cloud handoff](../../../../zerospin-cloud/wiki/handoffs/027-handoff-three-model-control-plane-hard-cutover.md).
   Cloud Plan 027 is archived; its observed activation evidence remains linked.
3. Red Rope's separate activation gate and preserved dirty lockfile are owned by
   [Red Rope Plan 022](../../../../redropeparking/wiki/archive/plans/022-plan-fresh-zerospin-ownership.md).
   Its committed adoption was verified; the dirty working lock is not claimed
   frozen-consistent. No continuing work remains owned by this plan. Handed-off
   checks remain unverified until their receiving repositories record evidence.

## Approved direction

1. Remove authored named service queries: declaration callbacks, query types, the `queries` release property, their projected specification facts, and their runtime evaluator. Do not retain an empty registry, compatibility alias, ignored property, or old request decoder.
2. Remove `AggregateSessionApi.executeServiceQuery` and its public interface. An aggregate actor must not acquire a general read capability over another owner's models merely by authenticating its own session.
3. Replace the named-query SystemApi method with typed declarative service reads, matching administrative aggregate reads. The exact service release and its declared models bound execution; the SystemApi capability supplies the trusted System identity.
4. Use authenticated service actors, selected resources, service browser sessions, and local `useLiveQuery` for browser data. Do not add a replacement browser query endpoint, query visibility flags, credentials inside query parameters, or new read-only commands.
5. Migrate the Shopping example and all five main sibling consumers: Zerospin Cloud, Red Rope Parking, Mentor Mailbox, QRK, and Stackshirts. Preserve unrelated WIP and the already completed harness/Effect adoption.
6. Preserve unrelated storage, credentials, identities, persistence paths and immutable artifacts. The approved hard cutover empties only affected catalogue storage and declares fresh Agent Node class namespaces; it does not translate old rows or repurpose old Agent namespaces. Record actual local execution separately from deployed activation and provider work.

## Pre-cutover evidence and retained boundaries

1. Before 27.0.0, the callback `IServiceQuery` in `core/service/types.ts` received `db.query` and decoded parameters without actor claims. `AggregateSessionApi.executeServiceQuery` forwarded arbitrary registered service/query names within its authenticated System. Actor selections did not restrict that read. Both the callback type and browser capability are now removed.
2. [`ServiceSessionApi`](../../../packages/system-worker/src/ServiceSessionApi/ServiceSessionApi.ts) has no remote query method. [`makeServiceSessionDefinition`](../../../packages/core/src/serviceSession/make/makeServiceSessionDefinition.ts) fixes owner, actor, models, contracts, and claims schema. Browser queries read the selected local materialization.
3. Existing [`getSystemApi.executeAggregateQuery`](../../../packages/core/src/utils/getSystemApi/getSystemApi.ts) already prepares a typed selection, transports declarative model facts/options, checks returned compiler/layout identity, and maps positional rows locally. Reuse this mechanism rather than introduce another query language.
4. Cloud and Red Rope currently call native `new SystemApi(systemId)` methods and decode linked RPC envelopes at read sites. Replace that caller-side plumbing with native acquisition of the common typed SystemApi interface. Keep the raw capability and linked wire protocol for RPC infrastructure. The native adapter must not introduce HTTP loopbacks, new endpoint settings, secret acquisition, or copied query mapping.
5. The scoped inventory found twelve named queries, mostly backend reads. Current browser UIs already use service sessions. Red Rope's unused `admin.getPartner` lacks admin authorization on the generic query route; deleting that declaration and the browser capability closes the source-level exposure without replacing it with another customer endpoint.
6. Each [`ServiceActorVersionRepo`](../../../packages/system-worker/src/ServiceActorVersionRepo/serviceActorVersionRepoMigratableDORepoConfig.ts) currently provisions the full service model graph before calculating selected delivery. This plan does not redesign that materialization or introduce actor scopes for search terms/pages. A bounded service owner is not proof that its entire data set should be replicated to a browser.
7. [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md) and [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md) retain their resource/history, command, external-request, and continuation ownership rules. A read creates no admitted command, `serviceIndex`, command `outcome`, or model mutation.

## Approved public and internal APIs

### Typed administrative facade

Keep the concrete method name `executeServiceQuery`, with one replacement signature. The old `{ queryName, params }` signature disappears.

```ts
// 1. Build a connection-free selection from canonical declarations.
const db = makeQueryDbVersion({ models: marketplaceServiceReleaseV1.models });

// 2. The administrative capability supplies authority; the selection supplies shape.
const products =
  yield *
  systemApi.executeServiceQuery({
    serviceName: "marketplace",
    serviceVersion: 1,
    query: db.query.product.findMany({
      where: { id: { in: productIds } },
    }),
  });

// 3. Compute the existing quote from canonical rows; the read records no command.
return calculateQuote(products, frozenLines);
```

1. The facade accepts `{ serviceName: string, serviceVersion: number, query: QuerySelection<TResult> }` and returns an Effect whose success is `TResult`.
2. Add `ServiceQuerySchema` in `core/systemApi/ServiceQuerySchema.ts`: `ReadQuerySchema` plus `serviceName` and the existing `VersionSchema`. Its wire type is `IServiceQuery`; remove the old callback type from `core/service/types.ts` rather than retain a second meaning at that path.
3. `ISystemApiRpc.executeServiceQuery` accepts `IRpcRequest<[IServiceQuery]>` and returns the existing linked envelope containing `IReadQueryResult`. No function, SQL string, caller-supplied System identity, or row mapper crosses the wire.
4. Reject old named-query requests and `makeServiceRelease({ queries: ... })` at their normal strict boundaries. Remove the `QUERIES` generic slot from `IServiceRelease` and update explicit annotations, including Cloud's current WIP.

### One typed SystemApi interface, HTTP and native acquisition

Extract the typed administrative object currently returned by `getSystemApi` into server-only `core/utils/getSystemApi/makeSystemApi.ts`. Its constructor is `makeSystemApi({ rpc })`, where `rpc` is the existing decoded Effect interface `IApi<ISystemApiRpc>`. Export `ISystemApi` from `core/systemApi/ISystemApi.ts`, derived from the constructor's returned interface rather than duplicating its methods. Keep `getSystemApi()` as the HTTP acquisition entrypoint and add `getNativeSystemApi(systemId): ISystemApi` in System Worker for trusted native acquisition.

1. `makeSystemApi` owns the existing concrete `executeServiceQuery` and `executeAggregateQuery` methods. Each accepts its existing owner identity plus `query: QuerySelection<TResult>` and returns mapped `TResult` in an Effect. Keep preparation, strict `ReadQueryResultSchema` decoding, compiler/layout checks and `mapRows` inside this module. Preserve the concrete `aggregate-query-*` and `service-query-*` diagnostics, `rpc-invalid-response`, error encoding and current command behavior. Internal code must not select a domain through a flag, factory or diagnostic bundle.
2. Core `getSystemApi()` retains `ZerospinApiUrl`/`SecretKey` acquisition and `getApi`'s gateway capability selection, then returns `makeSystemApi({ rpc })`. The constructor performs no capability acquisition, connection, command or read. Move the existing object, including command encoding and other administrative methods, rather than layer a second facade around it.
3. Add server-only `system-worker/src/getNativeSystemApi/getNativeSystemApi.ts`, exported as `system-worker/getNativeSystemApi`. It constructs the existing raw `SystemApi(systemId)`, binds its methods explicitly into `IApi<ISystemApiRpc>`, and passes that decoded Effect interface to the same constructor. The trusted `systemId` comes from the caller's existing native context; native acquisition does not accept a browser capability or new credentials. Keep raw `SystemApi` and `ISystemApiRpc` unchanged: local selections and row mappers never cross the wire.
4. The native adapter owns request envelopes and linked-result handling once: propagate the current trace context, validate `LinkedRpcEnvelopeSchema`, retain its trace link in an available `TelemetryCollector`, and decode the result. Preserve domain failures; normalize native Promise rejections into the Effect failure channel with `rpc-invocation-failed` and malformed envelopes with `rpc-invalid-response`, so Red Rope can retain its unavailable/error mapping. Follow the existing `getApi` linked-envelope behavior. `readRpcEnvelope` consumes internal telemetry envelopes and must not be used here. Use explicit native method bindings; do not add a reflection-based adapter requiring casts or a configurable transport framework.
5. Delete `executeQuerySelectionRpc.ts` and remove its SDK export. Export the common `ISystemApi` type from the SDK; `makeSystemApi` remains available through its Core module for native adapter construction and existing decoded-capability integration. Export no aggregate/service selection helper or `*Rpc` replacement. Caller code uses `api.executeServiceQuery` and `api.executeAggregateQuery`; it supplies neither prepared wire facts nor a per-query request callback.
6. Keep `ISystemHarnessApi` as `Pick<ISystemApi, 'executeServiceCommand' | 'executeServiceQuery'>`. Its in-process service read resolves the exact registered release and uses the existing `executeQuerySelection({ db, models, selection })` under its current execution permit and System context. Retain encoded service-read failures at that interface. Remove its prepared-wire round trip rather than fabricate a complete RPC capability or widen the harness's application-facing methods.

```ts
import { getNativeSystemApi } from "system-worker/getNativeSystemApi";

// Existing trusted native context: no HTTP or additional credentials.
const api = getNativeSystemApi(systemId);

return (
  yield *
  api.executeServiceQuery({
    serviceName: "marketplace",
    serviceVersion: 1,
    query: db.query.product.findMany({
      where: { id: { in: productIds } },
    }),
  })
);
```

### Owner execution and consistency

1. SystemApi decodes the wire request and binds its trusted `systemId`. Resolve only the exact `{ systemId, serviceName, serviceVersion }` ServiceVersionRepo; never select a latest release or accept a browser-supplied owner capability.
2. The keyed Repo resolves its registered release models, uses `compileReadQuery`, and collects positional rows synchronously under its existing execution permit. Return `{ rows, compilerVersion, layout }`. Reuse the aggregate read compiler and result schema.
3. Model specs must match declared models exactly. Internal checkpoint, command, delivery, audit, and credential tables are not selectable. Retain the compiler's refusal of callbacks, raw SQL, placeholders, and extras in administrative selections.
4. Read current committed materialization under the permit. Existing activation catch-up remains framework-owned; this read does not execute admitted backlog, await the latest source admission, reserve rows, or make a later command atomic with it. Callers requiring a command's execution must retain that command's explicit execution evidence.
5. Queries perform no model repair, copying, or backfill. Only command execution/replay and framework materialization produce model data. Recorded external responses still reach model updates through their continuations.
6. Align `ISystemHarnessApi` and Shopping's injected API with `ISystemApi`. The harness uses its local selection executor and returns mapped results without a wire round trip. Keep its existing System-origin restriction, execution permit and provider-layer substitution.

### Browser reads

```ts
// 1. Authentication establishes organizationId in the actor's canonical identity.
selections: {
  system: db.query.system.findMany({
    where: {
      organizationId: { eq: identity.sql.placeholder("organizationId") },
    },
  }),
}

// 2. The browser queries only the rows already admitted to its selected view.
useLiveQuery({
  session,
  query: db => db.query.system.findMany(),
});
```

1. Preserve complete pure session declarations, their application SharedWorkers, authenticated actor identity, selected models, and existing `Initializer` lifecycle.
2. Keep filtering/pagination local when the selected working set already fits the UI. Do not silently replace a privileged maintenance directory with an ordinary user's selected membership view.
3. No active browser caller of the removed remote method was found in the five siblings. Re-run that bounded caller check during implementation; migrate any newly discovered browser caller to an appropriate existing actor/session without expanding row exposure.

## Hard-cutover storage boundary and runtime gate

| Persisted responsibility                                        | Effect of this change                                                                                           | Required handling                                                                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SystemRepo.acceptedDefinitions.spec`, service-release entries  | Existing specs can contain required `queries`, including `{}`. Removing it changes the strict embedded spec schema. | Empty the exact affected catalogue at cutover. Do not strip the field, ignore excess properties or rewrite definitions. Preserve unrelated stores. |
| Physical `acceptedDefinitions` table                            | SQL columns remain `key` and `spec`; there is no table/column migration.                                        | Distinguish the changed persisted JSON contract from unchanged SQL layout.                                                                                     |
| Service resource tables, browser service locks/materializations | No query-registry field is stored in these shapes.                                                              | Do not bump browser stamps or clear model/browser storage solely for this API removal.                                                                         |
| Red Rope retained `hasInvitation` commands                      | The superseded command declaration disappears; historical input may still reference it.                         | Preserve history and do not promise old-history replay, translate it into reads, or retain a compatibility command. Include it in activation readiness review. |
| Existing deployment artifacts/full SystemSpec consumers         | Older immutable bytes may retain the old service spec shape.                                                    | Inventory their actual schema dependencies; preserve artifacts and reject incompatible input rather than rewrite it.                                           |
| Aggregate-only Systems                                          | This query-registry removal does not change aggregate-release specs.                                            | Do not impose unrelated resets. Other existing cutovers remain separate.                                                                                       |

1. [`readAcceptedDefinition`](../../../packages/system-worker/src/SystemRepo/acceptedDefinitions/readAcceptedDefinition.ts) uses strict excess-property decoding. Advancing an application service version does not translate the retained old catalogue. The approved hard cutover requires empty affected catalogue storage for activation. Catalogue reset is an explicit operational action, never an automatic decoder or application startup repair.
2. Inventory actual SQL shape and retained Service specs before resetting a local catalogue. For query-field removal alone, the SQL columns remain `key` and `spec`: empty that catalogue transactionally and preserve other SystemRepo tables and other Durable Objects. Do not use CLI `--clean`, which deletes the complete development persistence scope.
3. Preserve System IDs, Worker names, dispatch namespaces, local persistence paths and browser partitions. Fresh Agent Node class namespaces are the explicit approved ownership cutover; they do not change System identity or reuse an old version-bearing namespace.
4. Before deployed activation, identify the actual affected catalogue and old Agent namespaces in the selected environment. Apply the approved hard cutover within that exact scope and retain distinct provider/deployment evidence. Source checks and local empty storage do not establish deployed readiness. No compatibility decoder, catalogue rewrite, identity translation or automatic reset command belongs in the implementation.
5. Stackshirts' already committed purchase-field cutover has its own empty-storage requirement. This read API plan neither repeats that change nor authorizes resetting its affected stores.

## Consumer migration matrix

| Owner / current query                                           | Migration                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shopping `marketplace.getProducts`                              | Delete the unused declaration. ProductList already reads its catalog service session.                                                                                                                                                                                                                                                                     |
| Shopping `marketplace.quotePurchase`                            | Delete the declaration. In the existing external quote request, read all referenced Product rows in one typed private selection, then perform the existing pure quote calculation. Do not substitute browser prices.                                                                                                                                      |
| Cloud `system`, `instance`, `deployment`                        | Convert the three existing private read helpers to exact ID selections. Preserve their current `undefined` → `null` return convention and their callers' identity/organization checks.                                                                                                                                                                    |
| Cloud `organizationSystems`, `systemInstances`                  | Convert the existing helpers to filtered typed `findMany` selections. Retain current hosted routing, credential issuance, Admin/Cloud API, and CLI scope validation.                                                                                                                                                                                      |
| Cloud `instanceDeployments`                                     | Delete the unused declaration and uncalled `readInstanceDeployments` helper. Dashboard deployment data already comes from its service session.                                                                                                                                                                                                            |
| Red Rope `app.getMetros`                                        | Delete the unused named query and its unused imports. Do not add an unneeded new browser session; existing Fleet UI reads remain intact.                                                                                                                                                                                                                  |
| Red Rope `admin.getPartner`                                     | Delete the unused query and registration. Admin's existing service session already selects Partner rows.                                                                                                                                                                                                                                                  |
| Red Rope `admin.checkInvitation`                                | Delete the query and its only caller, the dead `authenticateInvitedMember` helper. Preserve current userActor authorization based on persisted invitation acceptance.                                                                                                                                                                                     |
| Red Rope active `hasInvitation` command and membership resolver | Superseded by [Plan 022](../../../../redropeparking/wiki/archive/plans/022-plan-fresh-zerospin-ownership.md): enrollment owns approvals and records ordinary grants to private per-person fleets. Delete the read-only command and lookup-based resolver. A private typed eligibility read may remain solely for advisory Slack suppression; it never grants access. |
| Mentor `listOrganizationsForAttachmentCleanup`                  | Delete the named query. Move its existing paging into the private API client's `listOrganizations`, backed by typed Organization selections. Preserve ordering, cursor, lookahead, and scheduled-cleanup checkpoints.                                                                                                                                     |
| QRK, Stackshirts                                                | No named-query source migration was found. Adopt the exact new package group and run the relevant existing checks. Preserve QRK's recorded generation and Stackshirts' recorded notification cleanup.                                                                                                                                                     |

1. Shopping must retain empty/invalid lines, duplicate line identity, missing product, invalid quantity, unsafe/nonnegative price, and subtotal overflow refusals. Read the required products in one owner snapshot, then map canonical names/prices to the frozen lines. Preserve existing request retries/error mapping and the continuation's quote identity, arithmetic, and stale-purchase checks.
2. Shopping's `ShoppingSystemApi`, live acquisition, and harness-provided layer must use the same typed read surface. Preserve recorded service-command delivery and its existing command receipt semantics.
3. Cloud's private credential pairs, immutable bundles/environment values, and recovery facts remain in CloudRepo/private artifact storage. Read model pointers without returning private payloads to browser replicas. Preserve the existing three-model WIP rather than restoring the previous two-model implementation.
4. Red Rope preserves verified-primary-email evidence, unavailable/error handling, permanent fleet approval and recorded provider continuations while replacing ownership under Plan 022. Source enrollment admission, destination command admission and the fleet's committed access grant remain distinct facts. Browser service sessions reveal only the person's admission; they do not expose the invitation directory. Typed eligibility reads used for advisory notification suppression allocate no command ID or receipt.
5. Mentor paging stays lexicographic by Organization ID, strictly after its cursor, with one lookahead row and `nextCursor` only when another page exists. Keep the existing private limit policy; the current cleanup caller requests one item, so its selection needs at most two rows.

### Cloud commit prerequisite

1. The listed Cloud migrations refer to the current three-model working tree. Its `systemV1`, `instanceV1`, `deploymentV1`, contracts, and coupled API/frontend changes are not all present in committed `519b53abc`. Partial staging of only the read helpers would produce a broken committed tree.
2. Require the existing three-model control-plane work to land in its own coherent, reviewed feature commit before committing Cloud's API migration on top. That feature dependency is existing work, not an additional feature to implement or silently absorb into this plan. Preserve its unrelated edits and do not include them in a query migration commit.
3. The migration can be prepared and checked against the current WIP in isolation while that prerequisite is pending. Do not add a two-model fallback, commit helpers without their dependencies, or claim the Cloud migration complete while its dependency closure is uncommitted. If the feature base has not landed at Cloud's commit step, record that step as blocked and continue independent producer/consumer work.
4. Re-resolve the landed feature commit and apply the prepared migration surgically, then check both its committed snapshot and integrated working tree. This prerequisite does not authorize activation or reset of the feature's persisted storage.

## Planned file hierarchy

Legend: `+` create, `~` modify, `-` delete. Brace groups list concrete sibling files or package directories; version/lock changes are scoped to the released fixed package group. No vendor subtree changes are planned.

```text
zerospin/
  + wiki/plans/255-plan-typed-system-service-reads.md
  packages/core/src/
    ~ service/{types.ts,make/makeServiceRelease.ts}
    - service/executeServiceQuery.ts
    ~ system/{types.ts,SystemSpecSchema.ts,project/projectOwnerSpec.ts}
    + systemApi/ServiceQuerySchema.ts
    + systemApi/ISystemApi.ts
    ~ systemApi/ISystemApiRpc.ts
    ~ utils/getSystemApi/getSystemApi.ts
    - utils/getSystemApi/executeQuerySelectionRpc.ts
    + utils/getSystemApi/makeSystemApi.ts
    ~ testing/systemHarness/{types.ts,makeSystemHarness.ts}
    ~ utils/README.md
  packages/system-worker/src/
    + getNativeSystemApi/getNativeSystemApi.ts
    ~ SystemApi/executeServiceQuery/executeServiceQuery.ts
    ~ executeServiceQuery/executeServiceQuery.ts
    ~ ServiceVersionRepo/ServiceVersionRepo.ts
    + ServiceVersionRepo/executeServiceQuery/executeServiceQuery.ts
    ~ AggregateSessionApi/{AggregateSessionApi.ts,AggregateSessionApiFailure/AggregateSessionApiFailure.ts}
    - AggregateSessionApi/executeServiceQuery/executeServiceQuery.ts
  packages/core/tests/
    ~ contracts.typecheck.ts
  packages/system-worker/tests/
    ~ repo-names.spec.ts, agent-runtime.spec.ts
    ~ support/agentRuntimeConfig.ts, support/agentRuntimeWorker.ts
  ~ packages/sdk/src/index.ts
  packages/sdk/skills/
    ~ zerospin-author-feature/SKILL.md
    ~ zerospin-external-work/SKILL.md and its affected bundled references
  examples/shopping/
    ~ src/zerospin/{ShoppingSystemApi.ts,ShoppingSystemApiLive.ts}
    ~ src/zerospin/services/marketplace/marketplaceServiceReleaseV1.ts
    ~ src/zerospin/aggregates/user/contracts/getExternalPurchaseQuoteV1.ts
    ~ tests/{system.spec.ts,promotion-checkout.spec.ts,system.typecheck.ts}
  ~ packages/*/package.json, pnpm-lock.yaml, release metadata
  ~ tests/README.md, wiki/glossary.md and affected architecture/pattern guidance

zerospin-cloud/
  ~ apis/src/controlPlane/cloudControlPlaneV1.ts
  ~ apis/src/controlPlane/read{System,Instance,Deployment,OrganizationSystems,SystemInstances}.ts
  - apis/src/controlPlane/readInstanceDeployments.ts
  ~ apis/test/system.spec.ts
  ~ apis/src/Worker.ts, apis/src/CliApi/buildDispatchScriptMetadata.ts
  ~ apis/{wrangler.jsonc,env-types.d.ts,worker-configuration.d.ts}
  ~ apis/src/controlPlane/README.md, README.md, AGENTS.md
  ~ {apis,admin,cloud,ui}/package.json, pnpm-lock.yaml

redropeparking/
  + wiki/plans/022-plan-fresh-zerospin-ownership.md
  ~ apps/zerospin/src/{system.ts,fleet/,enrollment/,partners/,metros.ts}
  - superseded shared member/partner aggregates and role-named services
  - named queries, read-only hasInvitation, obsolete membership resolver
  ~ customer/staff browser sessions, initializers and in-scope callers
  ~ apps/zerospin/test/system.spec.ts, apps/zerospin/README.md
  ~ apps/{zerospin,admin,web}/package.json, pnpm-lock.yaml

mentormailbox/
  ~ apps/zerospin/src/services/organizationMembership/organizationMembershipServiceV1.ts
  ~ apps/api/src/attachments/organizationChatClient.ts
  ~ apps/zerospin/test/system.spec.ts and existing affected API checks/docs
  ~ apps/{zerospin,api,app,hub,admin}/package.json, pnpm-lock.yaml

qrk.sh/
  ~ apps/{zerospin,app,api,scraper}/package.json, pnpm-lock.yaml
  ~ apps/api/BackendRepo.ts
  ~ affected package-version documentation only

stackshirts/
  ~ apps/{zerospin,app}/package.json, pnpm-lock.yaml
  ~ affected package-version documentation only
```

## Implementation and release sequence

1. Record committed producer/consumer heads, direct dependency pins, current scoped diffs, and dirty-file hashes without reading environment files or copying secrets. The planning baseline is committed Zerospin `fe76efee7f` / 26.0.2, Cloud upgrade `519b53abc`, Stackshirts cleanup `49c67e762`, QRK generation `d49ff8455`, Red Rope `edbcf1bda`, and Mentor `27fb9a692`. Re-resolve those facts before implementation rather than assume no concurrent work.
2. Create an isolated producer checkout from the committed current development line. Implement the concrete service read protocol, common typed SystemApi constructor and native acquisition, owner helper, harness alignment, and complete removal of the browser capability and named declarations. Do not publish the dirty producer's unrelated Agent/runtime redesign.
3. Migrate Shopping and its existing tests/types together. Update packaged consumer guidance to teach session browser reads and System-only selections, with no old named-query examples or read-only command workaround.
4. Implement the sibling source conversions in the matrix, reconciling Cloud's current WIP surgically and honoring its feature-base commit prerequisite. Keep existing pure browser sessions and private runtime boundaries. Do not create generic consumer adapters, barrels, new endpoint settings, or credential forwarding.
5. Run the focused verification below from the isolated producer snapshot. Inspect its publication artifacts and public types; removing the callback registry/signature is breaking, so publish the next fixed-group major release. Use 27.0.0 only if 26.x remains the current line and that version is available when execution begins. Use the established local registry and release workflow; do not clear registry data or publish unrelated WIP.
6. Adopt that one exact published version for every direct Zerospin/System-worker dependency and peer in all five siblings. Regenerate lockfiles and verify installed versions as well as manifest pins. Preserve current Effect and Drizzle wiring unless an actual producer dependency change requires otherwise. Load the installed matching Intent skills after adoption.
7. Integrate and commit only the scoped producer and consumer changes. A scoped commit must build independently of unrelated uncommitted source; verify the committed snapshot as well as the integrated working tree when they differ. Preserve dirty source, deleted WIP files, local ports, and persistence paths. Historical `vendor/zerospin` references remain unchanged.
8. After implementation, reconcile the glossary, service/API architecture docs, testing guidance, and affected local patterns with actual behavior. Amend or supersede a governing ADR only if the implemented decision warrants it; retain unaffected ADR 015/016 ownership rules. Record exact verification and storage-activation limitations, then archive this plan only after its in-scope work is complete.

## Verification seams and completion criteria

1. Extend existing framework test files under the current Vitest include patterns, with `@effect/vitest` and existing SQLite support. Add no test files, runner, platform environment or fixture framework. Keep fixtures inline or reuse the existing receipt declarations. Seed only fresh disposable databases; subsequent model writes must come from actual commands/operations.
2. Positive typed read: an actual registered service and its exact keyed owner return selected rows through both remote-style facade and native linked-envelope invocation. Prove inferred results, nested/projected JSON/date mapping, `undefined` for a missing first row, and empty lists without repeating the compiler's whole option matrix.
3. Negative boundaries: reject an undeclared/mismatched model, malformed compiler/layout result, and the old named-query request shape. Verify the removed method is absent from the constructed AggregateSessionApi capability while an authorized SystemApi read succeeds. Do not substitute TypeScript omission for the runtime capability check.
4. Storage guard: a retained old service-release spec containing `queries` is rejected by the new strict accepted-definition decoder, with the original bytes unchanged. This is a fail-closed cutover check, not a fallback-decoding or compatibility test. Use fresh test storage only.
5. Authoring/type checks: reject `makeServiceRelease({ queries: ... })`, preserve typed selection inference, and align Shopping/harness API injection. Run relevant resolved Nx library/type targets and the root typed test target; use explicit project/file scope and existing dependencies. Never verify Explorer.
6. Consumer checks: Cloud's typed harness test must switch from `organizationSystems` by name to a typed empty System selection; verify API/UI library and Admin/Cloud types against the current WIP. Red Rope follows Plan 022: private fleet isolation, actor policy, recorded admission-to-grant execution, advisory notification reads and absence of customer query capability, without calling live providers. Mentor proves cleanup paging preserves cursor/lookahead behavior and verifies the affected API/backend types. QRK and Stackshirts rerun their existing typed backend suites and relevant consumer types. Keep known unrelated frontend failures separate rather than expand this plan to repair them.
7. Read-only/source audit: no authored `queries` registry, callback types, old `queryName` service-query request, browser query capability, or Red Rope read-only invitation command remains in first-party runtime code. Keep historical archived documents as history; repair current docs and packaged examples. Inspect the selected worker's actual published API, not only declaration files.
8. Release/adoption completion requires publication, exact manifest/lock/installed pins, scoped checks, and commits in all five consumers. It does not imply authenticated UI, live provider, Durable Object delivery, production deployment, or activation of incompatible persisted Systems. Record those limits plainly; do not reset storage to make a readiness claim.

## Implementation evidence

- The isolated producer starts at committed `5e1d9a3a8`. The development line advanced during this work through separate commit `94c6988828`; it is part of that committed baseline. Later uncommitted producer changes were not copied into this checkout.
- Implemented typed SystemApi service reads, shared mapping, exact-release owner execution, harness alignment, Shopping migration and deletion of named service declarations/aggregate-session capability.
- `pnpm nx run zerospin:test` passes: eight files, 45 tests, including actual runtime capability absence and typed owner reads. No Explorer checks ran.
- All 18 fixed-group projects with a library task build; the nineteenth package, server-only, publishes static files and has no library task. All 19 version/export/bin manifests and the local-registry packaging dry run passed.
- Scoped lint targets pass with existing warnings (core 43, system-worker one, Shopping three). The introduced cross-package test import and unused import were repaired.
- Commit `48248f6393` contains the verified producer cutover and Shopping migration. All 19 fixed-group packages were published as exact `27.0.0` to the existing local registry; SDK metadata resolves the matching Core dependency.
- The producer commit is integrated into the original checkout. Checked three-way merges preserved five overlapping WIP paths and every unrelated dirty path, including concurrent test edits; no WIP was staged. The integrated `zerospin:test` target passes through its existing Nx cache: eight files, 51 tests, including the additional concurrent scenarios.
- Stackshirts adopts 27.0.0 in `7da63c56d` and its package-manager release-age exceptions in `8163d2a5`. Its two backend tests and app TypeScript check pass. QRK adopts it in `90f19d8f8`; its four backend tests pass. Subsequent App verification is recorded below.
- QRK's required custom Repo factory bindings are repaired in `44763fa1e`: the empty `/global` key codec, current namespace augmentation and existing invocation/envelope policies. API TypeScript passes against both isolated exact 27.0.0 and the concurrent 28.0.0 install. Scraper TypeScript passes on 27.0.0. The four remaining App diagnostics at repair time were resolved by the WallTree event type and canonical story `defaultState` fixes, already included in concurrent commit `c59a035dd`. Concurrent route work had already resolved the other four historical diagnostics. At repair verification, App TypeScript passed against exact 28.0.0 with a clean `c59a035dd` checkout.
- Mentor adopts 27.0.0 and its typed private cleanup directory in `09a0bc676`. Both backend flows, API TypeScript and App/Hub/Admin TypeScript pass; the existing directory flow now proves projected lookahead and strict cursor ordering. Its custom deployment entrypoint was reviewed against the installed CLI and syntax-checked without executing it.
- Red Rope's complete private-fleet redesign and 27.0.0 adoption are committed in `5ce250ffc`. Backend TypeScript and three domain flows pass; Admin TypeScript, Web/Admin builds and Storybook build pass. Current Web and Admin native TypeScript checks (`--noEmit --incremental false`) pass after the separately authorized frontend cleanup in `d7e9025f`; the earlier nine Web route errors are resolved. Plan 022 remains active for authenticated browser, provider and deployed-state verification; no storage reset occurred.
- All five siblings had matching 27.0.0 direct packages installed at the adoption audit. A separate concurrent QRK task subsequently advanced its manifests/install to 28.0.0. The checked repair line was committed and clean at `c59a035dd`; it is separate from the 27.0.0 adoption commit `90f19d8f8`. Later concurrent EditorLayout, README and research WIP is preserved and is not covered by that repair-time App check.
- Cloud's existing coherent feature landed separately in `733535ffd5`, independently passing API/UI libraries, its existing backend test, and Admin/Cloud TypeScript on exact 26.0.2. The 27.0.0 migration landed on top in `6f344c2666`, with its own isolated API/UI libraries, backend test and Admin/Cloud TypeScript checks. The integrated 27.0.0 working tree also passes Wrangler type generation and both Next application builds. Documentation clarification `4bda9f95c` changes no source behavior.
- Cloud's website, port/origin settings and unrelated dependency-lock re-resolution remain byte-preserved as WIP. Its production/test source is byte-identical to the verified candidate. SDK 27's AgentNodeRepo replaces version-bearing BackendNode identities and storage layouts, so a class rename would be invalid. Historical Cloudflare migrations remain unchanged; no namespace replacement, storage reset or runtime activation occurred.
- Red Rope local root `pnpm dev` is running (PTY `54990`): Web `https://redropeparking.localhost` (Vite `4338`), Admin `https://admin.redropeparking.localhost` (Vite `4948`), backend `http://localhost:4185` with `(system spec accepted)`. Curl observes Web 200 and Admin 307 to `/sign-in`. The Admin browser renders Clerk Google/email/password controls at `/sign-in`; Web Home renders `SIGN UP FOR BETA`, `SIGN IN` and `PROVIDE PARKING` links. Neither page has console errors; normal Clerk development-key and Web Three.Clock deprecation warnings remain. The existing schema-18 visitor database (`a22e6d...`) retained SHA-256 `1678678a5809ff6264162b7ccc48c9ef72ce07c5d6e3963983796f20cd722573` before/after. The current visitor namespace (`3655976b...`) comes from unchanged definition/SDK key derivation, and its served asset matches the bundle generated from current 27.0.0 sources byte-for-byte. No reset, identity/path workaround, provider call, authenticated flow or old-data migration occurred. These signed-out checks do not prove authenticated sessions, provider work or a full runtime cutover.
- The final read-only caller audit finds no active named service registry, old `queryName` request or browser remote service read in the producer/five consumers. Every sibling's existing backend suite uses `makeSystemHarness` and `@effect/vitest`. Shopping's stale workspace SDK range is corrected through pnpm in `52268ec98`, changing only its manifest and matching lockfile specifier.

## Query-executor rectification plan

The original release evidence above describes 27.0.0, which contains `executeQuerySelectionRpc`. It does not establish completion of this rectification. **One typed SystemApi interface, HTTP and native acquisition** above is the approved replacement. HTTP and native invocation are real adapters; selection preparation and row mapping are implementation details of their common typed administrative interface. The previously proposed pair of exported selection helpers is superseded and must not be implemented.

1. Re-resolve committed heads, current diffs and active helper imports. At the rectification inventory, authored `ownerKind` occurrences were confined to this helper and its callers; there was no persisted field to migrate. Preserve unrelated WIP and use a committed isolated producer snapshot for publication. Integrate only the rectification; do not copy unrelated runtime or documentation changes into its release.
2. Extract `makeSystemApi` and `ISystemApi`, make HTTP acquisition use that constructor, and implement the native acquisition adapter and explicit package subpath. Move query preparation/validation/mapping into the typed methods and delete the exported selection helper. Align the harness's narrow interface using its existing local executor; migrate the runtime-support read caller to `getNativeSystemApi(...).executeServiceQuery({ ..., query })`. Preserve existing typed administrative method signatures, raw wire schemas, exact release selection, synchronous Repo execution permits and current materialization semantics. No storage, authority or declaration change is required.
3. Cloud's five `read{System,Instance,Deployment,OrganizationSystems,SystemInstances}.ts` helpers and Red Rope's two advisory reads in `EnrollmentEligibility.ts` acquire `getNativeSystemApi` and call typed `executeServiceQuery`. Delete selection-helper imports, per-read request callbacks and caller-owned envelope decoding. Preserve Cloud initialization and final domain-result validation, and Red Rope's lazy native-module loading and unavailable mapping. Mentor wraps its already-decoded `getApi` capability with `makeSystemApi` at the directory-read acquisition site, then calls typed `executeServiceQuery` directly; retain its other command paths, existing credentials and cursor/lookahead policy. QRK and Stackshirts currently need no source conversion. No per-consumer facade, HTTP loopback or copied mapper is needed.
4. Verify through the typed administrative interface in existing files only. Convert the service case in `repo-names.spec.ts` from direct helper calls to typed `executeServiceQuery`, preserving projection/date mapping, missing-row, empty-list, undeclared-model and mismatch assertions. Include one aggregate mapped success and mismatch rejection, a malformed result and native linked-envelope refusal, and native invocation-failure propagation. Use the existing runtime-support path to prove native typed acquisition, linked trace retention and selected rows; retain the runtime capability-absence check. Extend `contracts.typecheck.ts` for service/aggregate result inference and structural compatibility of HTTP, native and the narrow harness interface. Keep harness behavior checks through its existing injected API. Add no test files, fixtures, runners or configuration and do not test private selection helpers. Run `pnpm nx run zerospin:test`; its resolved dependencies build the required libraries. Run scoped Core/System Worker lint and `pnpm exec oxlint packages/sdk/src/index.ts` (SDK has no lint target), then inspect the built common interface, native acquisition export and absence of the deleted Core/SDK helper. Audit authored source in the producer and five siblings for remaining `ownerKind`, `executeQuerySelectionRpc`, replacement administrative selection-helper exports or per-read transport callbacks, excluding generated/vendor artifacts and historical records. Preserve the existing local database `executeQuerySelection` used by the harness.
5. Removing the SDK symbol and Core deep-import path is breaking. Use the established fixed-group release workflow from the isolated verified snapshot; choose the next available major after rechecking committed/published versions rather than reusing 27.0.0 or assuming 28.0.0 is free. Adopt that exact release in direct fixed-group dependency/peer pins, lockfiles and installs across the five already scoped siblings. Run their existing backend suites plus affected Cloud API/UI, Red Rope backend and Mentor API typechecks. Preserve unrelated consumer WIP and report unrelated verification failures separately. The implementation and adoption evidence is recorded below.
6. After implementation, replace generic-helper guidance in Core's utils README and the packaged external-work reference with typed SystemApi calls and HTTP/native acquisition; reconcile affected current architecture guidance. Review glossary consistency without adding implementation helpers as domain terms. This local refactor does not warrant a new ADR. Record the release, commits and checks here; retain the separate runtime/storage decisions in **Remaining work**. No storage reset, deployment, provider call or live activation is part of this rectification.

### Rectification file hierarchy

Legend: `+` create, `~` modify, `-` delete. This is the rectification scope; the broader hierarchy above also records the original cutover.

```text
zerospin/
  ~ AGENTS.md, wiki/plans/255-plan-typed-system-service-reads.md
  packages/core/src/
    - utils/getSystemApi/executeQuerySelectionRpc.ts
    + utils/getSystemApi/makeSystemApi.ts
    + systemApi/ISystemApi.ts
    ~ utils/getSystemApi/getSystemApi.ts, utils/README.md
    ~ testing/systemHarness/{makeSystemHarness.ts,types.ts}
  + packages/system-worker/src/getNativeSystemApi/getNativeSystemApi.ts
  ~ packages/system-worker/package.json (native acquisition export)
  ~ packages/core/tests/contracts.typecheck.ts
  ~ packages/system-worker/tests/repo-names.spec.ts
  ~ packages/system-worker/tests/support/agentRuntimeWorker.ts
  ~ packages/sdk/src/index.ts
  ~ packages/sdk/skills/zerospin-external-work/references/recorded-external-work.md
  ~ packages/*/package.json, pnpm-lock.yaml, release metadata
zerospin-cloud/
  ~ apis/src/controlPlane/read{System,Instance,Deployment,OrganizationSystems,SystemInstances}.ts
redropeparking/
  ~ apps/zerospin/src/fleet/EnrollmentEligibility.ts
mentormailbox/
  ~ apps/api/src/attachments/organizationChatClient.ts
{zerospin-cloud,redropeparking,mentormailbox,qrk.sh,stackshirts}/
  ~ existing direct fixed-group dependency/peer manifests and pnpm-lock.yaml
```

## Rectification implementation evidence

1. Implemented `makeSystemApi`, common `ISystemApi`, HTTP acquisition, explicit native bindings and `system-worker/getNativeSystemApi`. Native invocation validates linked envelopes, propagates trace context, retains received links and converts invocation rejection to an encoded failure. Deleted the old selection helper, SDK export and every authored code `ownerKind` use in the isolated producer.
2. The harness now performs local typed selections under its existing permit. Existing compiler checks prove service/aggregate mapped result types and common HTTP/native/harness interfaces. Existing runtime scenarios prove strict result refusal, native envelope/invocation refusal, trace propagation and real Workerd service reads across reconstruction. The isolated `pnpm nx run zerospin:test` passes eight files and 60 tests; the integrated checkout passes eight files and 66 tests, including preserved concurrent scenarios. No test files, fixtures, runners or configurations were added.
3. All 18 fixed-group library targets build for both 29.0.0 and final 29.0.1; the nineteenth package publishes static files. SDK runtime inspection confirms the deleted export is absent, clean Core outputs omit the old deep path, and the native package subpath resolves. SDK lint passes without warnings; scoped Core/System Worker lint passes with 43/one pre-existing warnings and no introduced warnings. The final compiler and all eight focused Repo/native-interface cases pass again. The 19-package publication dry run passes. Nx Cloud reports its existing cache-access 401 after successful local tasks; that does not change their results.
4. pnpm declared the native adapter's direct `@zerospin/server-only` workspace dependency and the root compiler program's direct `system-worker` development dependency. Published 28.0.0 Core source matched committed baseline `88544d80b3`; System Worker source differed only in six README files. Isolated implementation/release commit `42146c0495` was integrated as `2a12230d71`, preserving concurrent source and test WIP. All 19 packages were published as 29.0.0 to the existing local registry.
5. The artifact audit found stale Intent `library_version` fields. Isolated patch `87d3787dd6` updates all eight packaged skills and publishes the fixed group as final **29.0.1**; integrated commit `ea1604c61d` has the identical committed tree. No runtime TypeScript changed in that patch. Registry metadata and actual tarballs confirm all 19 versions and exact framework dependencies, all eight matching skill versions, the new native subpath and absence of the removed helper. The integrated offline frozen install passes. No remote pushes, provider calls, deployment or storage operations were performed.
6. QRK adopts final 29.0.1 in `e24031b1a8`: 22 direct manifest/lock/installed references match, and its four backend tests pass through Nx. Stackshirts adopts it in `c84621a8d9`: 13 direct references match and both backend tests pass. Its existing release-age exceptions and installed-version guidance now name the exact release. All eight installed skill versions match in both consumers. QRK's four original unrelated dirty files remain byte-preserved; no unrelated external lock resolution changed.
7. Red Rope adopts final 29.0.1 in `47d8d54a38`. Its isolated committed snapshot passes backend TypeScript and all three domain tests, with 22 exact direct manifest/lock/installed references. The integrated frozen install passed and the final installed audit still reports all 22 references at 29.0.1. A separate concurrent writer subsequently changed the original checkout's lockfile, including temporary Nx importers; those unknown changes remain unstaged. The committed lockfile is unchanged and verified. The currently changing WIP lockfile was not reinstalled or claimed as frozen-verified.
8. A final independent source audit finds no material issue in common typed acquisition, strict result handling, exact-release harness execution or native envelope/trace handling. All five Cloud reads, both Red Rope advisory reads and Mentor's directory read use typed query methods without per-query transport callbacks or manual envelope decoding. A bounded authored-source scan of the producer and all five sibling apps finds no `ownerKind`, `executeQuerySelectionRpc` or consumer `prepareRead()` use. Current docs now describe typed reads and the Shopping quotation calculation; historical release evidence remains explicitly historical.
9. Cloud adopts final 29.0.1 in `a801fd3e43`: 24 direct references match; its isolated API/UI libraries and existing backend test pass. Checked source/manifest integration preserves unrelated dirty files. The original checkout's lockfile retains its pre-existing non-framework resolutions and passes frozen validation/install; the scoped commit uses the independently generated clean-baseline lockfile. Native read source matches the verified snapshot.
10. Mentor adopts final 29.0.1 in `4f198776f4`: 25 direct references match, backend TypeScript and both backend flows pass, and affected API TypeScript passes. Fresh-checkout verification generated ignored Worker declarations through the existing value-free typegen command. The custom deployment guard/documentation now names 29.0.1; six imported CLI helpers and the stock deploy orchestrator are byte-identical from 27.0.0 to 29.0.1, and `node --check` passes without executing deployment. Original frozen installation passes and the integrated checkout is clean.

## Approved hard-cutover execution — 2026-10-22

The source audit covers the producer and all five siblings. No active named Service query declaration, old query RPC, exported selection transport helper or old Agent Backend class implementation remains. The producer already rejects `queries` and declares the new SQLite class exports, so these follow-up changes require no additional producer runtime release. Current catalogue documentation now describes models/contracts/Actors and six owner-bound identity kinds. Plan 220's older query-retention wording is explicitly superseded without claiming its separate deferred verification complete.

| Repository | Local catalogue inventory | Action |
| --- | --- | --- |
| Zerospin | No persisted local catalogue found in the inspected producer/example roots. | No reset. |
| Cloud | `apis/.wrangler/plan027` and configured `apis/.wrangler/plan027-v25`: each has three accepted definitions, including `cloudControlPlane@1` with six old queries. | Empty only each exact `SystemRepo.acceptedDefinitions` table. |
| Red Rope | Nine definitions; `enrollment@1` and `partners@1` have no query registry. | Preserve storage. |
| QRK | Three Aggregate definitions, no Service release catalogue. | Preserve storage. |
| Mentor Mailbox / Stackshirts | No repository-local `.wrangler` store found. | No reset. |

Both affected Cloud files are `v3/do/zerospin-api-v2-SystemRepo/cddb30c62fb3dd4b61e35e59a22a4b380b62c5c8562704fb06f9a2245e286da4.sqlite` beneath those exact roots. Both durable names match configured `sys_cloud_control_plane`; both already have the current `key`/`spec` SQL columns. No process held either root open. Under the explicit hard-cutover approval, each catalogue was emptied in a synchronous SQLite transaction: three rows to zero. Other SystemRepo tables were compared before/after and retained, including two Repo registrations and the migration/name records. All other durable files were byte-preserved: 72 in the older root and 66 in the configured root. Both SQLite integrity checks return `ok`. Private pre-cutover snapshots and hashes are recorded in `/private/tmp/plan255-catalogue-cutover-iln7omue/audit.json`. No field was stripped or translated, no System identity changed, and no complete development persistence root was cleared.

The old local Cloud Agent Backend namespace directories contain only empty metadata databases, with no Agent object database or pending work found. New Agent owners use their own class namespaces. API migration `v2-agent-node-repos` declares `AggregateAgentNodeRepo` and `ServiceAgentNodeRepo` as new SQLite classes while preserving the historical migration. Hosted uploads now always declare all 17 current SQLite classes through the documented `metadata.exports` field; the old create-only migration branch, deployment-ID migration tags and redundant class-name list are removed. The same declaration handles new and existing hosted scripts without guessing tags or renaming old classes.

Cloud source/configuration and its exact documentation hunks are committed in `61d1f576f1`, preserving unrelated WIP. Its existing `apis:lib` and `apis:test` pass, including its compiler and one harness test. A local mocked-fetch check proves the installed SDK serializes all 17 exports; configuration checks account for all 18 API bindings and preserve historical migration bytes. These are contained protocol/source checks, not provider execution or deployed acceptance. No new test file, fixture, runner or configuration was created. No provider call, deployment, remote namespace reset, resource/history deletion or browser reset was performed.

## Remaining work

None within this archived plan. Cloud verification and scoped cleanup live in the
[Cloud TODO](../../../../zerospin-cloud/TODOS.md#cloud-verification-deferred) and
[handoff](../../../../zerospin-cloud/wiki/handoffs/027-handoff-three-model-control-plane-hard-cutover.md).
Red Rope's activation and dirty-lockfile follow-up remain with
[Plan 022](../../../../redropeparking/wiki/archive/plans/022-plan-fresh-zerospin-ownership.md).
Archival records the maintainer's transfer of those responsibilities, not passing
results for the deferred checks.
