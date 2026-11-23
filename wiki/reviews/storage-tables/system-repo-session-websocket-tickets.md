# SystemRepo.sessionWebSocketTickets

**Original review:** 2026-10-16, with independent column-design and ticket-lifecycle reviewers. The review retained four SQL columns and recommended removing repeated outer identity fields while refusing null Agent Node identity before issuance. Its three-branch admission inventory, independent Agent versions and browser-producer descriptions are historical.

**Current reconciliation — 2026-10-23:** the approved cleanup is implemented under [Plan 221](../../archive/plans/221-plan-session-ticket-admission-cleanup.md). The current admission union has four branches: Aggregate Actor, Aggregate Agent, Service Actor and Service Agent. Agent Nodes are observers, with no independent Agent version or private bootstrap/completion recovery. This document reconciles the original finding with current source without reopening the table's purpose review.

**Verdict:** retain `ticketHash`, `sessionFamily`, complete `admission` and `expiresAt`, with matching-family atomic one-use consumption. Derive session and Service Actor identity directly from the retained full lock. Both Agent branches require nonempty observer `nodeId`; Actor Node identity remains nullable. [ADR 008](../../adrs/008-ordinary-and-recorded-continuation-authority.md) remains governing for spend before retained-row decoding, deadline checks and forwarding.

**Verification — 2026-10-23:** Plan 221 completes six cases in three existing Workerd specs, using actual production classes and disposable SQLite. All **98 System Worker tests across 25 files** pass with test typing and required dependency builds. Four-family SQL issue/spend, exact retained authority and captured forwarding are verified; one Service Actor case connects configured credential authentication through authorization, snapshot, ticket issuance, actual socket installation and resume. All 402 captured production modules remain unchanged. Ticket spend, socket installation and Agent observation lifecycle remain separate proof boundaries. No production defect or storage change is required by this verification.

## Physical owner and durable fact

One SystemRepo belongs to exact deployment `systemId`. A ticket row associates an opaque bearer-secret hash with previously validated admission and a thirty-second deadline. This temporary single-use capability is neither model data, retained history nor pending delivery. Its right is spent before the selected Chain is contacted, without waiting for a receiver acknowledgement.

ProductionWorker recognizes the two fixed session socket paths and forwards them to its configured SystemRepo. No per-row System ID, physical Chain name or arbitrary routing address is needed. The physical SystemRepo and retained admission supply the complete destination identity.

- [`systemRepoName.ts:6-12`](../../../packages/system-worker/src/SystemRepo/systemRepoName.ts#L6-L12) — binds the singleton physical owner to exact `systemId`.
- [`ProductionWorker.ts:39-65`](../../../packages/production-worker/src/ProductionWorker.ts#L39-L65) — validates the fixed socket routes and delegates to the configured SystemRepo.
- [`SystemRepo.ts:95-118`](../../../packages/system-worker/src/SystemRepo/SystemRepo.ts#L95-L118) — invokes native fetch admission with the Repo's durable database and bound System ID.

## Four SQL columns

All four columns are required/non-null with no defaults. The declaration has no explicit primary key, foreign key, secondary index, generated logical ID, issue/spend timestamp, status, retry count or command position. Shared migration-ledger storage is separate.

| Column          | Current responsibility                                                                                            | Retention rule                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ticketHash`    | Unique SHA-256 base64url hash of a random 32-byte bearer secret. Issuance and consumption use the same encoding.  | Immutable until consumption or issue-time expiry cleanup. The usable secret is never retained.                                                                                                  |
| `sessionFamily` | `aggregate` or `service`, derived from the admission branch and included in the atomic deletion predicate.        | Retain the separate SQL selector so wrong-family routes cannot spend a row, including one whose JSON cannot decode. It grants no authority by itself.                                           |
| `admission`     | Complete typed owner, actual claims/canonical Origin, declaration lock and Node binding for one of four branches. | Freeze until spend. A pointer or reconstruction from later declarations cannot replace the retained admission facts.                                                                            |
| `expiresAt`     | Sampled issue time plus 30,000 ms. Consumption rejects a deadline at or before its current time.                  | A matching-family consume deletes before checking expiry; later issuance reclaims unused rows whose deadline is at or before its sampled time. No exact-deadline physical deletion is promised. |

- [`systemRepoDbConfig.ts:19-27`](../../../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts#L19-L27) — declares the complete four-column ticket table.
- [`hashSessionTicket.ts:3-14`](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/hashSessionTicket.ts#L3-L14) — shares SHA-256 base64url hashing between issuance and consumption.
- [`createSessionWebSocketTicket.ts:16-36`](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/createSessionWebSocketTicket.ts#L16-L36) — encodes the full row, deletes expired rows and inserts the new row in one synchronous transaction.
- [`consumeSessionWebSocketTicket.ts:30-60`](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/consumeSessionWebSocketTicket.ts#L30-L60) — deletes by exact hash/family before decoding and deadline validation.

## Four admission branches

Every branch retains exact owner-release scope and a full declaration lock. There is no outer `sessionName`, outer Service Actor name/version, credentials, command payload, model rows or materialization checkpoint. Declaration payload schemas inside locks are comparison facts, not submitted command payloads. No null placeholder represents a field absent from a branch.

| Branch           | Retained scope and authority                                                                                                             | Node and lock                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `aggregateActor` | `aggregateId`, `aggregateName`, `aggregateVersion`, frozen `actorPath`, complete Actor Origin with actor name/version and actual claims. | Nullable/nonempty `nodeId`; full `aggregateSessionLock`. The lock supplies session name and must agree with Actor Origin. |
| `aggregateAgent` | `aggregateId`, `aggregateName`, `aggregateVersion`, Agent Origin `{ kind: 'agent', agentName }`.                                         | Nonempty observer `nodeId`; full `aggregateSessionLock`, including matching Agent Origin and session name.                |
| `serviceActor`   | `serviceName`, `serviceVersion`, frozen `actorPath`, complete actual `claims`.                                                           | Nullable/nonempty `nodeId`; full `serviceSessionLock` supplies session and Actor name/version.                            |
| `serviceAgent`   | `serviceName`, `serviceVersion`, Agent Origin `{ kind: 'agent', agentName }`.                                                            | Nonempty observer `nodeId`; full `serviceAgentSessionLock` supplies session and matching Agent name.                      |

Agent Origin and locks have no independent Agent version. Owner release versions still bind the selected view and the physical Agent Chain. An Agent `nodeId` binds ticket and later observer resume; it does not identify a command producer. The forwarding header named `x-zerospin-producer` carries this observer value on Agent branches without changing its responsibility.

All session names are nonempty. Ticket-local Aggregate and Service Actor locks strengthen shared session fields; Service Actor name is nonempty and Actor/owner versions use VersionSchema. The shared Service Agent lock already requires nonempty session and Agent names. Actual claims, frozen Actor path and declaration lock are separate facts: path alone cannot represent all Actor authority, and a lock is not proof of credentials authentication.

- [`SessionAdmissionSchema.ts:9-79`](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/SessionAdmissionSchema.ts#L9-L79) — declares four strict branch shapes, Node nullability and Origin/lock agreement.
- [`OriginSchema.ts:5-14`](../../../packages/core/src/contracts/OriginSchema.ts#L5-L14) — retains actual Actor claims and unversioned Agent Origin.
- [`ServiceAgentSessionLockSchema.ts:5-10`](../../../packages/core/src/serviceAgentSession/ServiceAgentSessionLockSchema.ts#L5-L10) — requires the Service Agent's nonempty session/Agent names and complete selected model/contract definitions.
- [`forwardSessionSocket.ts:26-117`](../../../packages/system-worker/src/SystemRepo/handleFetch/forwardSessionSocket.ts#L26-L117) — derives each exact Chain identity and its trusted headers from the spent branch.

## Complete locks and issue-time validation

AggregateSessionLock retains session name, Actor/Agent Origin declaration, complete selected model schema/index facts and complete contract declaration facts. ServiceSessionLock retains session name, Actor name/version, the claims schema and the same model/contract declaration groups. ServiceAgentSessionLock retains session name, Agent name and those model/contract groups. Preserve record keys, exact versions, optional members, ordered operations/index columns and complete authored schema documents. None is executable code or selected resource data.

Issuance strictly decodes unknown admission with excess-property rejection, then validates full authored authority. Aggregate Agents must match the registered Agent's exact owner pin and complete authored lock. Service Agents must match their exact named Service release, Agent, session and complete lock. Actor branches validate their full authored lock, decode every claim through the authored schema, derive Actor path and require that path to match; Aggregate claims must also agree with `aggregateId`. No secret is generated before these checks.

- [`AggregateSessionLockSchema.ts:7-55`](../../../packages/core/src/aggregateSession/AggregateSessionLockSchema.ts#L7-L55) — retains complete Aggregate Origin, selected model and contract declaration facts.
- [`ServiceSessionLockSchema.ts:6-15`](../../../packages/core/src/serviceSession/ServiceSessionLockSchema.ts#L6-L15) — retains Actor identity, claims schema and complete selected declarations.
- [`validateSessionAdmission.ts:18-40`](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/validateSessionAdmission.ts#L18-L40) — validates each Agent's exact authored owner/lock before issuance.
- [`validateServiceAgentSessionLock.ts:25-49`](../../../packages/system-worker/src/serviceAgent/validateServiceAgentSessionLock.ts#L25-L49) — checks named Agent, exact Service release/session and whole-lock equality.
- [`validateSessionAdmission.ts:42-88`](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/validateSessionAdmission.ts#L42-L88) — validates Actor locks, full claims, derived path and Aggregate instance agreement.
- [`createSessionWebSocketTicket.ts:38-64`](../../../packages/system-worker/src/SystemRepo/sessionWebSocketTickets/createSessionWebSocketTicket.ts#L38-L64) — validates admission before random-secret generation, hashing and atomic retention.

## Issuers, spend and forwarding

1. AggregateSessionApi and ServiceSessionApi use initialized Actor capability context, require the exact Actor Chain registration and issue nullable-Node Actor admission. Ticket issuance does not authenticate credentials again. SystemApi.openAgentSession resolves a registered named Agent and its pinned owner, reads a coherent public selected snapshot and issues the bound observer ticket. It no longer runs private bootstrap/outcome recovery.
2. After strict validation, SystemRepo generates a random 43-character base64url secret and hashes it outside SQL. Cleanup and full-row insertion commit synchronously together. The secret returns after commit. A lost reply after commit leaves an undisclosed row to expire rather than a durable delivery retry.
3. Method, fixed path, upgrade header and exactly one valid ticket parameter are checked before consumption. After hashing, one `DELETE WHERE ticketHash AND sessionFamily RETURNING` is the one-use arbitration point. Wrong-family requests leave the row untouched; two matching consumers cannot both obtain it.
4. The row is already deleted when decoding, family consistency or expiry is checked. Matching-family malformed/expired rows remain consumed. Interrupted forwarding, an unavailable owner, a lost reply or a failed/rejected upgrade does not restore the credential. An expired wrong-family row remains until matching-family consumption or later issue-time cleanup.
5. Forwarding is outside SQL. SystemRepo clears the entire query and caller-supplied `x-zerospin-*` headers, derives the sole Chain from physical System ID plus retained admission, supplies trusted context and calls that Chain's fetch. Ticket consumption proves only spend, distinct from socket installation, observer resume, Actor command admission, execution commit or retained `outcome`.

- [`AggregateSessionApi.createWebSocketTicket.ts:74-127`](../../../packages/system-worker/src/AggregateSessionApi/createWebSocketTicket/createWebSocketTicket.ts#L74-L127) — requires the exact Aggregate Actor Chain registration and retains its full bound admission.
- [`ServiceSessionApi.createWebSocketTicket.ts:68-130`](../../../packages/system-worker/src/ServiceSessionApi/createWebSocketTicket/createWebSocketTicket.ts#L68-L130) — derives Actor identity from the retained lock and requires exact Service Actor Chain registration.
- [`resolveRegisteredAgentSelection.ts:12-57`](../../../packages/system-worker/src/SystemApi/openAgentSession/resolveRegisteredAgentSelection.ts#L12-L57) — resolves the unversioned named Aggregate Agent, pinned owner and registered Aggregate instance.
- [`resolveRegisteredServiceAgentSelection.ts:12-47`](../../../packages/system-worker/src/SystemApi/openAgentSession/resolveRegisteredServiceAgentSelection.ts#L12-L47) — resolves the named Service Agent and exact pinned Service release.
- [`openAgentSession.ts:23-60`](../../../packages/system-worker/src/SystemApi/openAgentSession/openAgentSession.ts#L23-L60) — reads the Aggregate Agent public snapshot before issuing its observer ticket.
- [`openAgentSession.ts:66-96`](../../../packages/system-worker/src/SystemApi/openAgentSession/openAgentSession.ts#L66-L96) — reads the Service Agent public snapshot before issuing its observer ticket.
- [`handleFetch.ts:25-77`](../../../packages/system-worker/src/SystemRepo/handleFetch/handleFetch.ts#L25-L77) — validates request shape before matching-family consumption and forwards only decoded admission.
- [`forwardSessionSocket.ts:17-25`](../../../packages/system-worker/src/SystemRepo/handleFetch/forwardSessionSocket.ts#L17-L25) — removes the credential query and all caller-supplied trusted headers.
- [`forwardSessionSocket.ts:118-133`](../../../packages/system-worker/src/SystemRepo/handleFetch/forwardSessionSocket.ts#L118-L133) — calls the selected Chain outside SQL and classifies a rejected/non-Response forward after spend.

## Historical finding and current proof limits

The original reviewers retained full admission authority and justified `sessionFamily` despite its derivability: pre-decode family-filtered deletion preserves wrong-family non-spend even for malformed JSON. The original nullable-Agent mismatch motivated early Node validation. Current source has replaced that shape with nonempty observer Node identity on both Agent branches; it is not an outstanding defect. Outer session and Service Actor identity copies are likewise removed.

The fixed JSON schema cutover requires empty affected SystemRepo storage. It adds no alias, fallback decoder, translation migration or automatic reset. This verification authorizes no existing-store reset, deployment or commit.

Plan 221 verifies SQL shape/uniqueness, hash-only retention, thirty-second validity, strict issuance before ticket-secret generation, cleanup/insertion rollback, wrong-family non-spend even for corrupt rows, concurrent single use, reconstruction, exact-deadline expiry and malformed matching-row burn. HTTP guards preserve tickets; forwarding replaces caller authority and removes the complete credential query. Failed upgrades/forwarding remain spent. The configured Service credential journey uses actual authorization, selected snapshot and socket/resume; the other three forwarding branches return captured finite responses. Those responses do not prove Agent socket lifecycles. Real provider integration, current Agent observer guarantees and broader registration retain independent verification ownership. [Plan 151](../../plans/151-plan-storage-table-review.md) owns the remaining backlog.
