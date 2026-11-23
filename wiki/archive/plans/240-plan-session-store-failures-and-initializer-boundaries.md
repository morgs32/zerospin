# Session store failures and authenticated Stackshirts verification

**Date:** 2026-10-17

**Naming update:** [Plan 280](280-plan-react-session-component-names.md) renames the current concrete React ownership components to `…Session`. Historical `Initializer`, `MockInitializer` and consumer-specific names below record the original implementation and verification.

**Status:** Complete and archived on 2026-10-27. The remaining Stackshirts consumer checks pass with installed Zerospin `37.0.0`: authenticated Account readiness, purchase-query rendering, nonterminal notification, terminal fencing/error retention and Initializer retry. Two application worker-bundling repairs pass the production build. No storage reset, package release or payment was performed.

**Basis:** [Session error research](../../research/session-fatal-errors-and-live-query.md). Final producer source review used `0579a08926`; Stackshirts verification used its existing checkout at `aa0ce498d` plus the two application-file repairs below. Unrelated working changes were preserved.

## Decision and current ownership

One existing session store owns lifecycle status and `failure`. A reported command refusal preserves readiness; a terminal session failure revokes execution, withdraws initialized capability and pins the first terminal error. Applications subscribe to changed nonterminal failures for notification. The owning Initializer presents terminal errors through `renderError(error, retry)`; retry disposes and replaces the owner.

Current [makeSessionFailureReporter](../../../packages/core/src/sessionFailure/makeSessionFailureReporter.ts), [SessionAttempt](../../../packages/react/src/sessionInitialization/SessionAttempt.tsx), [SessionConstructionBoundary](../../../packages/react/src/sessionInitialization/SessionConstructionBoundary.tsx) and [useLiveQuery](../../../packages/react/src/useLiveQuery.ts) retain these responsibilities. Completed [Plan 276](276-plan-session-lifetimes-and-node-commands.md) supersedes the original lifecycle implementation recipe with direct lifetime ownership. The [session failure pattern](../../patterns/react/session-store-failures.ts) governs the same store/reporting boundary.

Stackshirts now uses Guest and Account owners in [WorkspaceOwner](../../../../stackshirts/apps/app/src/sessions/WorkspaceOwner.tsx). [Payment](../../../../stackshirts/apps/app/src/screens/Payment.tsx) gates Account readiness; [PaymentDetails](../../../../stackshirts/apps/app/src/screens/PaymentDetails.tsx) reads purchases through the Account session's `useLiveQuery`. Separate Payment/Purchase Initializers and the original `13.0.0` adoption recipe are superseded.

## Original delivery evidence

These are historical results, not checks rerun during this closure:

- Producer commit `9236acb0a1` published all nineteen fixed-group packages at `13.0.0`, with registry integrity checked. Producer library and scoped TypeScript/lint graphs passed, including Native. Built public-interface probes and eight mounted MockInitializer browser scenarios exercised refusal classification, terminal pinning, query/construction boundaries, observer isolation, cleanup and disposal/reinitialization.
- QRK, Red Rope Parking, Mentor Mailbox, Stackshirts and Zerospin Cloud installed exact `13.0.0` packages with lockfile updates. Their scoped delivery builds/types passed. QRK Library's browser showed initialized content and recoverable explicit-offline transport.
- Authenticated Stackshirts verification was left open after an unsuccessful Clerk callback and a legacy migration-ledger startup failure. The current acceptance below closes those remaining consumer observations; it does not assert that old credentials or old retained schemas were repaired or migrated.

## Stackshirts worker repairs

The actual app initially displayed its guest construction-error view, then a worker-connection error. Both defects were in the existing Webpack integration:

1. Webpack converts worker URL expressions to `TrustedScriptURL`. The existing `workerArtifact.url` helper read `.href`, yielding `undefined`. It now uses `String(url)` for both Guest and Account.
2. Next's inherited bare `_N_E` export assignment failed inside the module worker. Both worker entries now declare `library: { type: 'self', name: '_N_E' }`. [next.config.ts](../../../../stackshirts/apps/app/next.config.ts) enables `self` alongside Webpack's inferred library modes with `['...', 'self']`. Emitted workers assign `self._N_E` directly.

The repairs preserve worker identities, declarations, backup paths, storage schemas and lifecycle ownership. Independent source review found no further correctness or pattern issue. No framework source, compatibility path or consumer persistence workaround was added.

## Verified completion — 2026-10-27

1. **Installed packages and backend.** The actual pnpm copies of `@zerospin/core`, `@zerospin/browser` and `@zerospin/react` are `37.0.0`, not producer links. Installed Intent and relevant React/browser/parallel-model guidance load. Root `corepack pnpm dev`, without a clean/reset option, reaches `Ready on http://127.0.0.1:11002/ (system spec accepted)`. The historical migration-ledger failure did not recur. This establishes whole-SystemSpec acceptance, not canonical command execution.
2. **Build.** `corepack pnpm --filter @stackshirts/app build` passes with exit 0: optimized compilation, TypeScript and all ten static pages, with the dynamic payment route in the final inventory. Both production worker bundles use direct `self._N_E` assignment. Scoped whitespace checks pass. The first invocation stopped on Next's security-upgrade notice; the identical retry completed. No dependency upgrade occurred. Build log: `/private/tmp/plan240-stackshirts-build.log`.
3. **Correct browser and authenticated readiness.** The first native Chrome selection lacked the intended profile; no sign-in there was required. The user opened their regular profile, exposed as the connected Chrome profile `Person 1`; the native window independently identified it as Morgan. Google sign-in then succeeded, and the Account session rendered `Your designs`. Its actual store reported `status: 'ready'` and nonnull initialized capability. The normal UI created one design and selected three logos through existing commands.
4. **Purchase-query rendering.** The authenticated payment route for an absent, well-formed purchase ID rendered `This payment is unavailable in your account. Open a purchase from your designs.` This exercises the real Account purchase query and ordinary missing-row presentation. It is not evidence of a populated purchase or a payment submission.
5. **Nonterminal refusal and notification.** A temporary DevTools probe called the already loaded public `stageAggregateSessionCommand` with `createAccountShirt` and validly shaped absent stack/shirt IDs. The guard returned `Failure`, code `account-design-invalid`, message `Create a stack before making its shirt.` Stackshirts displayed that message through its existing subscription. The actual Account remained `ready` with initialized capability, and stack/shirt/purchase counts were unchanged. This was local command refusal, not admission or a retained canonical Failure `outcome`.
6. **Terminal failure and fencing.** The actual Account's public `reportFailure({ origin: 'session', error })` reported a temporary foreign error. Its store synchronously became `failed` with no initialized capability. A later report did not replace the first terminal error; another public staging call threw that retained error object. The owning Account Initializer displayed `Could not open your account`, its normalized error and `Try again`.
7. **Retry and cleanup.** Clicking the actual `Try again` action withdrew the error view, reopened Account readiness and restored the authenticated payment query's ordinary empty state. Reload then removed all temporary probe variables/runtime references and reopened the normal page. The probes used existing React development handles and loaded module exports only to reach the mounted session/public API; no application instrumentation, test file, fixture, runner or configuration was created. The extra probe tab was closed, and the authenticated designs tab was retained.

The normal UI check leaves one draft design, `stk_ffd4f175-1628-4126-a515-a56f3faa8ec2`, with three selected logos. It was not deleted or used to submit a payment. No credentials, browser databases or existing backend storage were reset or translated. No payment, Stripe confirmation or Slack notification was submitted. No package publication or deployment occurred.

Local captures: `/private/tmp/plan240-command-refusal.png`, `/private/tmp/plan240-terminal-account.png`, `/private/tmp/plan240-account-recovered.png`, `/private/tmp/plan240-authenticated-payment.png` and `/private/tmp/plan240-authenticated-designs.png`. The native captures record the actual probe page; the browser connection's DOM snapshot did not refresh for the external DevTools mutations. Development log: `/private/tmp/plan240-stackshirts-dev.log`.

## Proof limits

The terminal probe establishes explicit reporting, fencing, Account presentation and retry; it does not simulate every transport/query failure source. Earlier framework scenarios retain their separate bounds. The absent-purchase query establishes normal authenticated rendering, not Stripe confirmation, webhook handling, 3DS, provider health or a populated purchase projection. Node retention, admission, canonical execution, dispatch acknowledgement and canonical `outcome` retention are distinct facts and are not inferred from these UI observations.

## Remaining work

None within Plan 240. The independent QRK artifact/browser acceptance work in [Plan 258](258-plan-schema-backed-backend-errors.md) is also complete. Explorer verification remains outside scope.
