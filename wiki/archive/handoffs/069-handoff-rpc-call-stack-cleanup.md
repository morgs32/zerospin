# Handoff: RPC call-stack cleanup

**Date:** 2026-10-08
**Status:** Archived on 2026-10-11 with [Plan 069](../plans/069-plan-rpc-call-stack-cleanup.md) at the user's request. The [complete framework review](../../reviews/2026-10-11-framework-rearchitecture.md) covers the source-review queue; continuing implementation belongs to its named plans. The sections below preserve the original handoff and do not direct further work under Plan 069.
**Original focus:** Continue the remaining RPC queue after reviewing completed Iteration 1.

## 1. Goal

1. Continue [Plan 069](../plans/069-plan-rpc-call-stack-cleanup.md). It owns the completed backend provisioning iteration, verification record, and remaining RPC queue.
2. Review the next selected RPC call stack and agree its bounded cleanup before implementation. Keep the parent plan active until the queue is finished.

## 2. Done

1. [Iteration 1](../plans/069-plan-rpc-call-stack-cleanup.md#iteration-1--backend-provisioning-during-session-authorization) is complete: initialize → authenticate credentials → authorize, provisioning if necessary → grant access. Authentication has no command capability. The actor authorizer executes ordinary owner-catalog commands with aggregate-bound system authority and receives authoritative final commands backend-side.
2. Authorization and SystemApi share administration projection staging, retained admission, synchronous mutation ownership, and original-version result recovery. Authorization holds no execution permit or SQLite transaction. The superseded authentication-only actor staging path was removed. Default/inherited authorizers and custom service inference remain intact.
3. Admission cleanup preserves credential-only input, claims/path validation, mutable-policy validation, durable audit settlement, interruption behavior, and telemetry. Local getApi rejection now uses `rpc-invocation-failed`; server failure codes and unexpected promise rejections remain defects.
4. Administration checks cover type inference, malformed input before writes, owner-only command forgery, authoritative guards, rollback, final results, and admission audits. The isolated real Wrangler check covers same-owner reentry, concurrent provisioning, preserved profile/permissions, lost-response recovery, and refusal before capability grant. Scoped core/worker/browser typechecks, lint, initialized-session checks, formatting, documentation links, and diff review passed with required dependencies. Existing unrelated lint warnings and Nx Cloud access code 401 remain.
5. Affected READMEs, workflow diagrams, glossary, and plan were reconciled. No fixed schema, storage reset, QRK migration, commit, or publication was included. No ADR was needed because the implementation retains existing authority and persistence owners.
6. The prior final-command naming work and Plan 071 consolidation remain intact. Preserve all unrelated working-tree work, including the separate standalone session implementation and untracked archived documents.

## 3. Remaining at handoff creation

1. Remaining work for Iteration 1: None.
2. Review completed Iteration 1 before choosing the next method from the [RPC queue](../plans/069-plan-rpc-call-stack-cleanup.md#api-method-queue--2026-10-08). Shared SystemApi execution changed here, but its broader cleanup review remains pending.
3. QRK migration/publication is separately scoped: move provisioning into its ordinary user authorizer, remove the provisioner, make createUser owner-only, preserve subject uniqueness and existing data, and reread before granting access.

## 4. Settled boundaries

1. No browser direct-command SDK, admitted-access command RPC, named provisioning RPC catalog, protected flag, or service-authorization change.
2. Authors construct once before retrying execution within one authorization invocation. Separate invocations may construct distinct occurrences. Preserve existing repeated-ID recovery; do not add the discarded content-conflict rule.
3. Owner commands own uniqueness and guard checks in synchronous transactions. Successful provisioning remains durable even when later authorization refuses. Client actor catalogs exclude owner-only provisioning commands.

## 5. Pointers

1. [Implementation outcome and verification](../plans/069-plan-rpc-call-stack-cleanup.md#implementation-outcome--2026-10-08)
2. [Repo authorization](../../../packages/system-worker/src/AggregateVersionRepo/authorizeAggregateSession/authorizeAggregateSession.ts)
3. [Shared direct execution](../../../packages/system-worker/src/executeDirectAggregateCommand/executeDirectAggregateCommand.ts)
4. [Administration staging](../../../packages/system-worker/src/AggregateProjectionRepo/stageDirectAggregateCommand.ts)
5. [Administration check](../../../packages/system-worker/checks/aggregate-administration.mjs) and [real provisioning check](../../../packages/system-worker/checks/authorization-provisioning/run.mjs)
6. [Session admission](../../architecture/browser/Identity.md), [SystemApi](../../architecture/SystemApi.md), and [direct execution](../../architecture/server/executeAggregateCommand.md)
7. [Repeated-ID guidance](../../patterns/apis/return-the-domain-object.md)

## 6. Archival outcome

1. The old RPC review handoff is superseded by the complete framework review and its implementation plans. The archived parent records completed iterations, verification evidence and continuing-work ownership.
2. QRK migration/publication remains separately scoped and unperformed; its requirements are preserved in the parent's QRK follow-up.
3. Remaining work in this archived handoff: None.
