# Source-owned addressed async continuations

**Date:** 2026-10-12
**Status:** Superseded by [ADR 012](012-opaque-external-work-and-originating-chain-continuations.md).
**Implementation:** Historical implementation in [Plan 142](../archive/plans/142-plan-addressed-async-continuations.md). Its replacement is implemented in [Plan 150](../archive/plans/150-plan-opaque-external-work.md); external continuations return to their originating chain.

The decision below records the superseded design. ADR 012 removes alternate continuation addresses, returns recorded results to the originating chain and moves Shopping's cross-owner call into its authored external request. Stable children, frozen authority and source proof remain required.

## Context

Shopping checkout belongs to Marketplace, while purchase creation and payment belong to the user's aggregate. A custom bridge reconstructed a purchase command outside the normal recorded-continuation path. The Effect contract cutover preserved same-owner delivery, so rebuilding PR #49 requires addressed receiving operations while retaining its newer evaluation and storage boundaries.

## Decision

Concrete aggregate async operations carry receiving aggregate name/version and instance ID. Concrete service operations carry receiving service name/version and exclude framework aggregate fields. Each generated codec captures the exact external declaration alone; there is no separately authored owner/contract binding or receiver catalog. System validation checks canonical external membership, and emission preparation validates the exact receiving release and declaration before any output applies.

Server implementations and server-only external continuations may emit either receiving family. Ordinary public programs remain model-only. This lets Shopping's user-owned purchase continuation create resources and emit payment only for a new purchase, without a bridge-only public command or a composition wrapper.

The emitting VersionRepo retains receiving address separately from source owner, frozen origin and System name. It owns the stable child ID, producer execution and terminal outcomes, recorded observation and outbox. Authors own external request retries under [ADR 011](011-author-owned-external-request-retries.md); recorded producer failure is terminal while work without either recorded outcome remains recoverable. Response recording and child enqueue remain one synchronous transaction. Recorded reconstruction uses frozen facts without the initiating command, a current receiving declaration or current System name. Replay has null production authority.

Receiving Chains resolve the emitting VersionRepo using their bound System ID and prove the complete child before local atomic recorded admission. Receiving family, release and aggregate instance are part of that proof. Source outbox pages group by receiving address and acknowledge only after every group is retained. Partial delivery retries stable children; already-retained equal children recover before current-declaration lookup.

Continuations across logical owners or aggregate instances require claims-free external declarations and use receiving system authority. Same aggregate name/instance or same service name preserves frozen origin across release versions, including historical actor identity. An emitting actor's claims cannot authorize another owner. [ADR 008](008-ordinary-and-recorded-continuation-authority.md) continues governing ordinary ingress and recorded retention; this decision extends its source-proof routing and authority distinction.

## Alternatives and consequences

Keeping the custom bridge would leave production evidence and delivery recovery outside normal continuation delivery. Restoring the old mapper/binding design would reverse the current checked Effect evaluation API. Moving production into the receiver would obscure which command originally authorized the external request.

Addressed delivery adds a source-proof RPC and receiving-address grouping. Retained source evidence must remain available for retry; receipt acknowledgement means admission, not completion of execution. Changed pre-release async storage and transported schemas require empty affected storage, with no compatibility decode or row translation. The forward-only migration lifecycle remains intact.
