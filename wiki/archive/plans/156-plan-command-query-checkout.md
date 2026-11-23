# Checkout through a command and one live query

**Status:** Complete. Implemented and verified on 2026-10-15.  
**Date:** 2026-10-15  
**Research:** [combined checkout and staging findings](../../research/shopping-command-query-checkout.md)

## Agreed outcome

The Shopping UI synchronously stages commands and observes its cart and linked
purchase through `useLiveQuery`. The session owns persistence, delivery and
reconciliation; the user aggregate owns quotation and payment continuations.

This incorporates the checkout and synchronous-service-staging handoffs supplied
in chat. Local staging success means the command and optimism committed to the
session journal, not worker persistence, authoritative execution or payment.

## Implementation

- Co-own one personal cart, its items, purchases and purchase items in the user
  aggregate. Marketplace retains the catalog and a read-only quotation query.
- `addToCart` atomically reuses or creates the cart and product line from creation
  IDs supplied once per click. Remove separate first-cart choreography.
- `checkout({ cartId, purchaseId })` creates the same optimistic and authoritative
  preparing purchase and frozen item rows, and retains `cart.checkoutPurchaseId`.
- Quote the frozen lines outside the transaction. Validate quotation before
  storing authoritative prices and scheduling keyed payment. Quote refusal or
  payment decline keeps the cart editable; uncertain payment keeps it locked.
  Paid state and removal of the matching cart items commit together.
- Replace CheckoutButton orchestration with one command and one cart/purchase
  query. Remove the dedicated HTTP endpoint, nonce helper, submission wrappers,
  application subscriptions and superseded cross-owner purchase bridge.
- Present genuine command refusals through one session notification layer and
  root Sonner toaster. Render retained domain outcomes from the query and retain
  the existing session-wide terminal-error presentation.
- Return service staging synchronously; remove its public acknowledgement wait
  and execution `accept`, preserving background handoff and native waiters.

## Verification

Use existing scoped Nx checks and inline SQLite/contract probes. Create no test
files, fixtures or runners and perform no Shopping browser verification. Verify
pre-ack service return, rollback, consecutive optimism, confirmation/rejection,
checkout ordering and duplicate refusal, quotation/payment outcomes, stale
continuations and atomic paid clearing. Use fresh isolated storage for the fixed
schema cutover; preserve unrelated work and fulfillment ownership.

## Verification evidence

- Production WA-SQLite probes pass for synchronous service staging, rollback,
  consecutive optimism, reconciliation and duplicate finalization.
- Actual Shopping aggregate sessions and one live query pass same-ID confirmation
  without transient disappearance and rejected-purchase rollback.
- Quote/payment probes pass authoritative pricing, correlation, refusal, stale
  continuations, decline, uncertainty and atomic paid clearing.
- Updated existing contract runner: all eight groups pass in the primary checkout.
- Configured Workerd activation file: all three tests pass in the primary checkout,
  including real Shopping RPC quotation and paid/refused retained outcomes.
- Workerd test typecheck and Shopping source typecheck/lint/build pass.

### Isolated final source verification

Other active plans changed recovery and command-origin source during the final
primary dependency rebuild. A detached verification checkout applies the captured
pre-recovery working-tree patch plus the final Shopping/staging changes and original
terminal-error helpers. Its workspace packages are linked within that checkout;
its storage is disposable. No unrelated primary edits were reset or repaired.

The isolated six-project Nx graph (`shopping`, core, browser, React, native and
system-worker) passed `ts`, `lint`, `build` and `test-workerd-ts`, including 17
dependency tasks. The inferred `tsc:typecheck` graph also passed (29 tasks), the selected existing
Workerd file passed all three tests, and the existing contract runner passed all
eight groups against the same immutable source. Its framework assertions use the
captured pre-origin baseline with only the checkout verification group updated;
concurrent origin-schema assertions were excluded along with their runtime changes. Existing system-worker
lint warnings, Vite chunk warnings and Nx Cloud access warnings are non-failing.

Nx project-reference sync reports existing root/examples/native drift. Source
checks use supported `--skipSync`, preserving dependency builds without rewriting
unrelated configurations. No new tests, fixtures or runners were created, and no
Shopping browser verification was performed.

The verified Shopping UI/domain files match the primary checkout. Concurrent
command-origin changes to seed declarations and recovery changes to capability
checks remain owned by their independent plans and were preserved. The temporary
verification checkout is archived after recording this evidence.

## Remaining work

None.
