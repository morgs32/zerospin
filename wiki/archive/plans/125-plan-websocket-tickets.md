# Retain one validated session destination per socket ticket

Status: Implemented and verified in the approved goal on 2026-10-11.

SystemRepo duplicates ticket hash/expiry/cleanup/insert/spend code for aggregate and service sessions. Each table stores both a destination name and independent identity fields. Aggregate consumption must parse/reconcile both; service consumption ignores retained `repoName` and reconstructs its identity. Actor aggregate tickets retain actorPath only inside repoName. One discriminated session admission tuple should be retained once, and its physical owner name derived once when forwarding.

Source: [tables](../../../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts), [aggregate creation](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/SystemRepo/createAggregateSessionWebSocketTicket/createAggregateSessionWebSocketTicket.ts), [service creation](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/SystemRepo/createServiceSessionWebSocketTicket/createServiceSessionWebSocketTicket.ts), [aggregate consumption](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/SystemRepo/consumeAggregateSessionWebSocketTicket/consumeAggregateSessionWebSocketTicket.ts), [service consumption](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/system-worker/src/SystemRepo/consumeServiceSessionWebSocketTicket/consumeServiceSessionWebSocketTicket.ts), [socket forwarding](../../../packages/system-worker/src/SystemRepo/handleFetch/handleFetch.ts).

1. Replace both ticket tables with `sessionWebSocketTickets` containing `ticketHash`, `sessionFamily` (aggregate or service), `admission` (a schema-validated JSON tagged union) and `expiresAt`. Admission kind is `aggregateActor`, `aggregateAgent` or `serviceActor`; retain the exact DO owner tuple plus node ID if used, session name, full origin/claims and accepted lock. Aggregate actor tuple explicitly includes actorPath. SystemRepo's configured system ID is implicit and cannot be supplied independently by callers. Every union branch has only its own fields; no nullable kitchen-sink row.
2. Remove retained repoName. Creation receives the admitted tuple, validates its internally consistent origin/lock/release/node binding once, and retains supported values without losing full claims. The admitted API caller still proves the Plan119 selected owner is registered before asking for a ticket; agent bootstrap proves it through successful snapshot. Do not replace the current registration proof with an unchecked client tuple.
3. Share one crypto/lifecycle procedure: 32 random bytes, 43-character base64url raw token, SHA256 hash only in storage, 30-second expiry, synchronous expired-row cleanup plus insertion in one transaction. Returning the raw token after commit is the sole disclosure.
4. Share one consumption procedure. The route supplies expected session kind family. Validate token syntax, hash, spend matching-family row with a single `DELETE ... RETURNING`, then decode/expiry-check the spent row. Unsupported stored data, expiration and downstream forwarding failure still burn that ticket. A wrong session route must not consume the other family. Preserve kind-specific public invalid-ticket refusal codes at the route adapter.
5. Forwarding selects the DO solely from the retained validated tuple and exact current name codec. Delete aggregate parse/reconciliation and unused service repoName. Strip caller-supplied internal headers and all ticket query parameters, then synthesize trusted headers from the consumed admission. Browser route names/token response remain unchanged. Preserve Upgrade/query cardinality checks and network failure response mapping.

```ts
const createSessionWebSocketTicket = Effect.fn(function* (
  props: TicketCreation,
) {
  const admission = yield* validateRetainedSessionAdmission(props.admission);
  const ticket = yield* makeSessionTicketSecret();
  yield* retainSessionTicketTx(admission, ticket.hash, ticket.expiresAt);
  return { ticket: ticket.raw, expiresAt: ticket.expiresAt };
});

const consumeSessionWebSocketTicket = Effect.fn(function* (
  props: TicketConsumption,
) {
  const hash = yield* hashSessionTicket(props.ticket);
  const spent = yield* spendSessionTicket(hash, props.sessionFamily);
  return yield* decodeUnexpiredSessionAdmission(spent);
});

const forwardSessionSocket = Effect.fn(function* (
  request: Request,
  route: SessionSocketRoute,
) {
  const ticket = yield* readSocketTicket(request, route);
  const admission = yield* consumeSessionWebSocketTicket({
    ticket,
    sessionFamily: route.family,
  });
  const owner = yield* acquireRetainedSessionOwner(admission);
  const trusted = makeTrustedSessionRequest(request, admission);
  return yield* forwardWebSocket(owner, trusted);
});
```

Exact public secret result field names must remain the current API's result (schematic above is not permission to rename the wire response). SQL issue/spend are synchronous; hashing and owner forwarding are outside SQL transactions. Token consumption is irreversible before downstream RPC. `makeTx` preserves full Cause; no transaction may extend across forwarding. Ticket-family predicate is part of the spend SQL, not a post-delete check.

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
  packages/system-worker/src/SystemRepo/
    ~ systemRepoDbConfig.ts
    ~ SystemRepo.ts # modify public backend methods
    + sessionWebSocketTickets/SessionAdmissionSchema.ts
    + sessionWebSocketTickets/createSessionWebSocketTicket.ts # create
    + sessionWebSocketTickets/consumeSessionWebSocketTicket.ts # create
    - createAggregateSessionWebSocketTicket/*
    - createServiceSessionWebSocketTicket/*
    - consumeAggregateSessionWebSocketTicket/*
    - consumeServiceSessionWebSocketTicket/*
    ~ handleFetch/handleFetch.ts
    + handleFetch/forwardSessionSocket.ts
  packages/system-worker/src/
    ~ AggregateSessionApi/createWebSocketTicket/createWebSocketTicket.ts # modify
    ~ ServiceSessionApi/createWebSocketTicket/createWebSocketTicket.ts
    ~ SystemApi/openAgentSession/openAgentSession.ts
    ~ makeFixedDORepo/makeFixedDORepo.ts # modify namespace method surface
    ~ repoServices/SystemRepos.ts # modify method surface
```

Depends on [Plan119](119-plan-selected-view-owner.md): use only its surviving AggregateActorVersionChain, AggregateAgentVersionChain and ServiceActorVersionChain selected owner identities/capabilities. Retired Repo identities are removed by that plan and are never a ticket acquisition alternative. The scalar sessionFamily is derived from the admission union branch and checked by the row codec; SQL spend uses it so a wrong-family route leaves the ticket untouched while malformed admission JSON is still spent before decoding. It is a route classifier, not another destination identity. Plan086 owns opaque name-component encoding; use its settled codec and report unresolved empty/dot name semantics there, not here. Plan069 wire validation is completed scope; keep existing HTTP/RPC schemas.

Implementation order: use Plan119 selected-view tuple; define tagged admission schema; hard-cut table and shared lifecycle; adapt forwarding; adapt all three creation callers/capability method lists; remove duplicate procedures/imports; run gates and fresh-storage native socket flow. No backwards ticket decoding/second tables.

Verification: `pnpm nx run-many -p system-worker -t lib,ts,lint`; include `@zerospin/dev-worker,@zerospin/production-worker` existing resolved gates after inspecting their Nx project metadata if namespace typing changes. Existing native session WebSocket workflow is the runtime seam: one valid upgrade, reuse refusal, expired refusal, mismatched family retains other family's ticket, duplicate query refusal, spoofed header replacement, forwarding failure burns ticket, exact actorPath/agent selection, concurrent consume only one succeeds. Runtime checks were not executed in this review. Changed fixed tables require an isolated empty-storage environment. No new fixture/runner/configuration.

Postimplementation: record `session WebSocket ticket` as one one-use admission record in the glossary, replace workflow citations, and use one qualifying ADR for eliminating duplicated durable destination identities if the maintainer accepts that persistent ownership decision. Archive only after all creation/forwarding callers are cut over and verification completed.

## Implementation progress — 2026-10-11

One tagged admission table and unified issue/spend lifecycle replace family-specific tickets. Issuance validates exact lock, claims, identity and bound ownership; consumption atomically deletes only the matching hash/family before expiry/decode/forwarding. Forwarding strips untrusted admission headers and synthesizes retained provenance and selected identity. Worker library compilation passes. The aggregate ordinary-public-API cases below prove issuance, upgrade, reuse refusal, family/query preservation, concurrent consumption, trusted-header forwarding and natural expiry; the remaining runtime cases stay explicit.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Verified aggregate connection workflow — 2026-10-11

The native aggregate ticket issuance, WebSocket upgrade and forwarding happy path passed on two retained-storage warm launches, including a terminate/relaunch of the unchanged installed app with the same retained database files. The observed backend POST200/WebSocket101 is corroborated by HTTP200/101 responses in `/tmp/zerospin-goal-native-114-fixed-reopen-host.log` and `/tmp/zerospin-goal-native-114-fixed-second-reopen-host.log`; both corresponding screenshots (`/tmp/zerospin-goal-native-114-fixed-reopen.png`, `/tmp/zerospin-goal-native-114-fixed-second-reopen.png`) show the host online with Start game enabled. This establishes the aggregate connection happy path only.

### Verified ordinary public ticket cases — 2026-10-11

The existing already-built `tic-tac-toe:zerospin:dev` task started on port3006 without a clean, reset or build. It accepted `sys_tictactoe` using retained current-schema storage. The inline client used the account/instance generated by the latest native smoke (`/tmp/zerospin-goal-native-110-smoke-reopen-data.json`) and the app's existing Info.plist `pk_local`, its real credentials shape, existing `gameSessionDeclaration`, canonical lock constructor and actual `getApi`. Gateway aggregate admission and authorization returned the exact actor claims and empty index0 snapshot, establishing the selected-owner registration required before ticket creation. The public result contained only one 43-character opaque `ticket` field (`/tmp/zerospin-goal-125-public-admission.log`). No application command was submitted.

Actual Node with the installed `ws` client then exercised seven ordinary socket cases (`/tmp/zerospin-goal-125-public-sockets-node.log`, exit0), corroborated by the live backend log (`/tmp/zerospin-goal-125-backend.log`):

1. A valid aggregate ticket upgraded with HTTP101. The app's actual native node identity resumed to the expected index0/dispositionHash/outcomeIndex0 `replay-complete`, with no commands.
2. Reusing the spent ticket returned HTTP401.
3. Submitting an aggregate ticket to the service route returned HTTP401; subsequently using that same ticket on the aggregate route returned HTTP101.
4. Repeating the ticket query parameter returned HTTP400; subsequently submitting the same ticket exactly once returned HTTP101.
5. Two concurrent upgrades using one issued ticket produced exactly HTTP101 and HTTP401.
6. Supplying invalid caller `x-zerospin-origin`, producer, lock, actor-path and claims headers still upgraded with HTTP101 and completed the genuine native producer's exact replay. The invalid internal values could not install connection admission; the retained trusted tuple replaced them.
7. Waiting naturally for31seconds after issuance produced HTTP401 on first use and repeated use of the expired ticket.

The real development SystemApi inspection reported the surviving AggregateActorVersionChain registration containing the exact native aggregate identity, human actor/version and encoded account/instance actorPath (`/tmp/zerospin-goal-125-public-owner.log`). The existing name codec both reproduced that exact registration and decoded it to all seven exact owner fields (`/tmp/zerospin-goal-125-public-owner-assertion.log`, exit0). This bounds the evidence to that actual actor selection. The aggregate-agent branch and service-issued tickets were not exercised. The initial installed `ws` client under Bun timed out after the backend's HTTP101; it supplied no refusal evidence and required no product change. Node's completed run is the verification evidence. All successful sockets were closed and joined by the client. No source changes, new files/fixtures/runners/configuration, fabricated host bindings, credentials or authored declarations were used.

The owned backend then received SIGINT and the actual Nx dev task exited0 (`/tmp/zerospin-goal-125-backend.log`). Its CLI, main/auxiliary Workerd processes, port3006 listener and sole generated config `dev-config-7Mnmt2` were gone. The17 prior generated configurations retained exact names/inodes/mtimes, and the protected original storage backup retained all56 exact files, directory/file inodes, sizes, mtimes and SHA256 values against the original manifest (`/tmp/zerospin-goal-125-cleanup.log`). Retained verification storage was preserved; no cleanup reset it.

Current architecture/glossary/ADR links and sequence-step audits passed; source hashes are refreshed after formatting.

The current Shopping administrative inventory reports no registered `user@1.0.0` aggregates. Opening the existing `purchases@1.0.0` agent with the genuine native TicTacToe account returns `agent-aggregate-not-registered` before selected-owner or ticket acquisition (`lgr_d486fbaf840c5579`). This refusal does not establish agent ticket forwarding. The agent needs a genuine current Shopping user aggregate; creating a cart does not register that aggregate, and its ordinary purchase registration depends on an authenticated checkout's complete frozen quote. Shopping service actors likewise require a genuine Clerk credential accepted by the configured JWT key and authorized parties. The administrative key and direct claims cannot substitute for it. Shopping application browser verification remains prohibited even after the Mac is unlocked.

### Authorized isolated ticket matrix — 2026-10-11

The human subsequently authorized disposable `/tmp` fixtures and runners. The isolated `server-goal` Worker uses actual factory-authored aggregate, service and agent declarations, an explicit fixture authenticator, the production Gateway/SystemApi/session APIs and all actual Durable Object owners. Its storage is wholly under `/tmp`; existing TicTacToe/Shopping credentials, configuration and storage were not changed.

`/tmp/zerospin-framework-goal-server-qvh4z87h/ticket-matrix.log` passes the actual Node `ws` handshakes for aggregate actor, service actor and aggregate agent: each upgrades with HTTP101, resumes to its real snapshot index/hash and private0, and refuses spent reuse with HTTP401. Wrong-family requests preserve actor/service tickets; duplicate query refusal preserves a ticket subsequently consumed by exactly one of two concurrent requests. An actual hashed service ticket row contains no raw secret; explicitly expiring that genuine row refuses use. Earlier ordinary TicTacToe evidence above establishes natural thirty-second expiry.

Temporary bundle instrumentation observes the real forwarding request immediately before the unchanged owner `fetch`: hostile `x-zerospin-*` headers are absent, the full retained admission supplies the exact origin/claims/lock/producer, and an unrelated request header survives. The actual agent admission binds `auditor@1.0.0`, `agent-view`, its factory Node and exact registered aggregate. A controlled throw at that forwarding capability boundary returns HTTP500 after consumption; retrying its unchanged genuine ticket returns HTTP401. No synthetic ticket/admission/receipt was installed. The initial temporary hash assertion used hex instead of the production base64url digest, and the first event-count assertion included other agents' requests; those setup assertion errors were corrected and are not product evidence. All completed matrix sockets terminated and the runner joined exit0. Runtime ownership remains with the goal's isolated server and will be joined before cleanup.

## Remaining work

None.
