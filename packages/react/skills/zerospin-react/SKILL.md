---
name: zerospin-react
description: >-
  Use when acquiring a managed Zerospin React session, publishing a handle,
  reading claims or live queries, changing identity, or cleaning up an owner.
metadata:
  purpose: Connect explicit initialization, typed UI context and live reads.
  type: core
  library: '@zerospin/react'
  library_version: '42.0.4'
requires:
  - '@zerospin/sdk#zerospin-parallel-models'
---

# Own managed sessions without replacing public UI

Load `@zerospin/sdk#zerospin-parallel-models` first. Model edits after seed use commands.

1. Import each pure session definition directly from its defining module. Do not
   create UI declaration modules or module-level live sessions. Keep application
   layers, worker assets and host-only wiring separate from the declaration.
2. Call `useConnectedAggregateSession(definition, options)`,
   `useConnectedServiceSession`, `useStandaloneAggregateSession`,
   `useMockAggregateSession` or `useMockServiceSession` unconditionally. Options
   omit `definition` and otherwise use the concrete browser constructor's actual
   host/instance inputs. They may be a resolver returning options or an inactive
   `null`, `undefined`, `false` or `''`. Hooks return immediately without suspension;
   acquisition starts after commit. Layers are required when execution needs
   application services; connected layers also provide PublishableKey and ZerospinApiUrl.
3. Publish the returned handle with `<SessionProvider session={handle}>`. It never
   gates or replaces its children. Keep public shells outside readiness gates;
   nest providers for coexisting definitions, including guest and account sessions.
4. Gate database readers and command controls with `<SessionReady
definition={definition} fallback={...} renderError={(error, retry) => ...}>`.
   `renderError` is required; fallback defaults to null. Error views must not read
   the failed session. Use `useSession(definition)` inside ready content, then
   ordinary useLiveQuery, command functions and useClaims. `useSessionState(definition)`
   reads isEnabled/isReady/error/retry outside the gate without suspension.
5. The handle exposes isEnabled, isReady, error, retry and a ready-only session.
   Readiness can withdraw during recovery. Service readiness does not guarantee
   currency for writes. Use `useClearSessionAuthentication(definition)` anywhere
   inside its provider, including outside `SessionReady`, and await its action
   before the identity provider signs out. It revokes remembered offline
   eligibility for the owner's current and retired connected identities without
   deleting saved models. A never-enabled owner has nothing to revoke; failure
   and disabling do not discard an existing identity's clear capability.
   Clearing fences retries for that identity until the fixed inputs change.
   Connected credential sessions need complete `expectedClaims` to clear before
   first authentication. Disposal alone does not revoke eligibility. Surface
   revocation failures instead of claiming sign-out completed.
   Authentication and selected design ownership remain
   application concepts; do not treat session loading as signed out.

   Standalone options may set `discardUnrestorable: true` for disposable local data.
   The worker owns one bounded destructive restoration for recognized retained-data
   failure codes and uses captured validated seeds. It preserves healthy state,
   environment/access failures, foreign identity, and a concurrent repair observed
   after reset fencing. Completion/failure uses the same managed handle; no consumer
   storage deletion, private facade access, or reset waiter is needed.

6. Changes to fixed identity, definition, layer, host inputs, claims, seeds or
   backup path replace only the internal session generation. Do not key the app
   or public page to replace an account. Credential acquisition delegates to the
   latest committed callback. Disabling, unmount and retry fence old generations
   and release interrupted startup. No application persistence/delivery waiters.
7. Pass `{ onFailure: error => notify(error.message) }` as the optional third hook
   argument for changed nonterminal failures, including startup/recovery notices.
   It observes before initialization and through recovery; successful preservation
   stays silent. Terminal errors belong to SessionReady. Wire retry directly;
   framework ownership prevents overlapping/stale attempts and owns release.
8. Query errors terminate the owning session; foreign session errors propagate to
   the matching boundary. `useLiveQuery` keys contain changing query values.
   Mock hooks use the same definition and consumers with decoded claims and complete
   seeds, no transport. Substitute provider services through Effect layers.
9. Connected Aggregate and Service options accept `diagnostics` for optional startup spans.
   Browser connection failures emit bounded console diagnostics even when that
   option is disabled; Service diagnostics do not add a worker telemetry bridge.
   Run affected existing checks, report unexercised lifecycle behavior, and do not
   add prohibited test machinery.
