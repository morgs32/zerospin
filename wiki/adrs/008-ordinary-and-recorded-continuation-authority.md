# Ordinary and recorded-continuation authority

**Date:** 2026-10-11
**Status:** Accepted
**Implementation:** Plans 102, 121, 125 and 130 in the [framework refactor review](../reviews/2026-10-11-framework-rearchitecture.md).
**Session-ticket amendment:** [Plan 221](../archive/plans/221-plan-session-ticket-admission-cleanup.md) retains four explicit Actor/Agent admission branches and derives session/Service Actor identity from their full locks. Agent `nodeId` binds observation, not command production. Scoped verification completed on 2026-10-23: four-family SQL issue/spend and exact forwarding, plus actual configured Service credential authentication through authorization, ticket issuance and socket resume. All 98 System Worker tests pass. Other families’ captured finite responses do not establish their socket lifecycle; provider integration and broader registration retain separate ownership.

**Superseded decisions — command provenance (2026-10-25):**
[ADR 023](023-flat-command-origins-and-claims-free-continuations.md) replaces copied
parent Actor/Agent authority with claims-free immediate-parent Continuations,
object command origin with scalar flat fields, and nullable Actor producer metadata
with a required Node tuple. Both administrative command APIs are System-only.
Statements below about frozen Origin/claims inheritance or null Actor producer
fields are historical. Independent ordering, external request ownership/retry,
exact release, atomic recording, history and privacy decisions remain active.

## Context

Current declaration checks outside admission could reject an unchanged retained retry after its declaration disappeared. Recorded continuations used an ordinary-actor allowance and a trusted boolean, despite already carrying frozen producer evidence. Service system commands could not retain production authority. Duplicate ticket paths retained redundant physical destination metadata.

## Decision

Ordinary ingress decodes the complete supported page once before one synchronous ordered admission transaction. Each occurrence first recovers an exactly equal retained input. Only a new command requires current owner, ordinary declaration, actor/claims/payload validation, producer continuity and a fresh safe input position. A mismatch rolls back the page. Stateful guards remain in authoritative business transactions.

Recorded ingress has a distinct entrypoint. It proves every complete child against the retained originating VersionRepo outside SQL, then uses an explicit local recorded-command transaction. Under [ADR 013](./013-aggregate-delivery-history-and-projection-ownership.md), exact retained commands recover before remote proof after source pending cleanup. A new child is authorized by that release's complete frozen external-declaration and observation message; no live declaration is needed to reconstruct or prove observed delivery; the actor's ordinary browser allowlist cannot grant or deny that authority. There is no caller-supplied proof marker or trusted flag. System service production and transport retain explicit `{ kind: 'system' }` Origin; actor provenance retains frozen actor/claims. [ADR 012](012-opaque-external-work-and-originating-chain-continuations.md) settles delivery to the originating admission chain, with the original release and exact external contract version retained on the command. This replacement of addressed delivery is implemented in [Plan 150](../archive/plans/150-plan-opaque-external-work.md).

Once an observation is recorded, child reconstruction uses retained payload, response, origin and originating repo identity without reexecuting the program/request, looking up the source command or consulting a live external declaration. Opening that repo still requires its authored resource/schema release. Portable producer codecs run synchronously in an empty service context; suspension is canceled and flushed before classification, and composite Causes remain intact. Observation recording and child enqueue remain one synchronous transaction under [ADR 012](./012-opaque-external-work-and-originating-chain-continuations.md).

SystemApi command requests contain `{ command }`. Canonical admission decides current authority; the retained receipt determines which release result owner is awaited. Secret capability and administrative aggregate-envelope checks remain. Receipt recovery does not promise that an omitted historical release can execute or open its result owner.

One tagged admission selects exactly one Aggregate Actor, Aggregate Agent,
Service Actor or Service Agent owner. SystemRepo retains four required ticket
columns: unique `ticketHash`, `sessionFamily`, complete typed `admission` and
`expiresAt`. The complete lock supplies session identity and, for Service Actors,
Actor name/version. Retain actual Actor claims or canonical Origin and exact
owner release context. No outer session/Service Actor copy or physical Chain
name is stored. Agent Origin contains kind/name, without an Agent version.
Ticket-local schemas require nonempty session and Service Actor names and valid
declaration versions. Full authored-lock agreement, claims and Actor path remain
issuance requirements; issuance is not another credentials authentication.

Both Agent branches require nonempty observer `nodeId` before secret generation,
hashing or insertion. Actor `nodeId` remains nullable. Agent tickets authorize
observation/resume rather than command production or private completion recovery.
Expiry cleanup and insertion share one synchronous transaction. A matching route
family spends the credential through atomic DELETE RETURNING before retained-row
decoding, deadline checks or forwarding. Wrong-family routes cannot spend it.
Any later validation, forwarding or upgrade failure leaves it consumed. Forwarding
derives the sole owner and trusted headers from spent admission, removes the
credential and replaces caller-supplied internal headers. Ticket spend proves no
socket installation, command admission, execution commit or retained `outcome`.

## Alternatives

An outer current-registry check shadows retained recovery. A public trusted boolean makes authority implicit and mixes ordinary and recorded policy. Reconstructing executable declarations from stored metadata would turn a comparison catalogue into execution authority. Keeping redundant physical Repo names in tickets permits contradictory routing identities.

## Consequences

Exact retries remain recoverable independently of current declarations. New input still requires current authority. Frozen continuation delivery cannot rerun an external effect to reconstruct a child. Original-only external work and normal command replay remain governing; replay external descriptions are removed by ADR 012. Ticket and command-schema changes require empty affected fixed storage; no compatibility decode or migration is retained.

Plan 221 changes SystemRepo's fixed ticket JSON representation without changing
the four-column SQL model or the selected Chain protocols. It requires empty
affected SystemRepo storage and authorizes no automatic reset, deployment or
compatibility path. Plan 221 records this amendment’s bounded local runtime
verification; Agent observation lifecycle and real provider integration remain
separate obligations.
