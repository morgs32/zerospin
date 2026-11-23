# 070 — Require aggregate actor authentication callbacks

## Summary

Remove aggregate `authentication: 'none'` and direct claims admission. Every application actor must declare `{ credentialsSchema, authenticate }`; every aggregate admission invokes that callback. Public actors explicitly accept public inputs and produce admitted claims.

Keep the existing names. Claims mean **server-accepted actor context**; the callback determines which fields are verified identity and which are accepted public inputs.

## Implementation

1. **Require the declaration.** Remove `'none'` from `IAggregateAuthentication`. Give aggregate declarations a required-object authentication schema, separate from the service policy union. Reject missing policies, `null`, strings, and missing callbacks during construction. Actor updates inherit the previous object when omitted and validate replacements.

2. **Use one aggregate request shape.** Introduce `IAggregateAdmissionRequest` and its schema as `{ credentials: unknown }`. Apply them throughout AggregateApi, aggregate browser bootstrap, snapshots, tickets, and AggregateNode authentication. Reject `{ claims }` and mixed requests. Keep the existing service admission union unchanged.

3. **Always invoke authentication.** Decode credentials against the selected actor’s schema, call `authenticate`, and validate its returned claims before deriving selection identity or issuing access. Preserve provisioning through `executeCommand`, admission auditing, failure propagation, canonical actor paths, and Repo-owned session authorization. Delete the aggregate direct-claims branch and obsolete policy branches.

4. **Require browser credentials.** Aggregate `makeSession` requires `credentialsSchema`; initialization requires `getCredentials`, with optional `expectedClaims`. Remove aggregate initialization through `{ claims }` at both TypeScript and runtime seams. Keep `expectedClaims` as a local comparison expectation, never admission evidence. Acquire fresh credentials on each server admission, including reconnects. Factor credential-provider behavior for reuse by services without retaining an aggregate direct-claims path.

5. **Make manifests precise.** Aggregate actor specs always contain `authentication: { credentialsJsonSchema }`. Update manifest construction, types, and validation accordingly; service specs retain their existing policy shapes. Server callbacks remain outside browser bundles.

6. **Cut over current callers.** Tic-tac-toe supplies game coordinates through credentials and explicitly returns `{ aggregateId, instanceId }`. Explorer’s member actor explicitly accepts its public participant fields and returns claims for its existing room. Preserve their current public behavior. Shopping retains Clerk verification and server-derived aggregate identity.

## Verification

1. Extend the existing aggregate administration harness through real admission: invalid declarations, malformed credentials, callback rejection, invalid returned claims, and successful public and authenticated callbacks. Assert callbacks run and only their returned claims enter access capabilities. Preserve provisioning and audit success/failure coverage.

2. Extend browser and React checks: required credential schema/provider, rejection of direct claims initialization, precise credential and claims inference, fresh credentials on readmission, and `expectedClaims` mismatch handling.

3. Verify manifest rejection of aggregate string policies and preserve service admission and actor-free administrative behavior. Keep existing lock, aggregate membership, selection, and authorization checks.

4. Run scoped Nx typecheck/lint for core, system-worker, browser, React, Shopping, and tic-tac-toe; Explorer’s `typecheck` and `lint`; and the existing `aggregate-administration:check`, `initialized-session:check`, and `claims:check` tasks with their library dependencies. Check formatting and the scoped diff.

## Planned hierarchy and completion

`+` adds; `~` modifies. Grouped subtrees include their affected callers and checks.

```text
zerospin/
├── packages/core/src/
│   ├── identity/
│   │   ├── ~ types.ts
│   │   ├── + AggregateAuthenticationSchema.ts
│   │   └── + AggregateAdmissionRequestSchema.ts
│   ├── ~ aggregateActor/
│   └── ~ system/
├── packages/system-worker/
│   ├── ~ src/AggregateApi/
│   └── ~ checks/aggregate-administration.mjs
├── packages/browser/
│   ├── ~ src/aggregate admission, initialization, and Node transport
│   └── ~ checks/initialized-session.mjs
├── packages/react/
│   ├── ~ src/aggregate initialization hooks
│   └── ~ checks/claims.mjs
├── examples/tic-tac-toe/
│   └── ~ src/actor, session, and initialization declarations
├── explorer/
│   └── ~ src/zerospin/memberActorV1.ts
└── wiki/
    ├── plans/+ 070-plan-required-aggregate-authentication.md
    ├── ~ architecture/AuthoredSystem.md
    ├── ~ architecture/browser/Identity.md
    └── ~ glossary.md
```

1. Preserve the current Repo-owned authorization work and unrelated WIP. Service admission, standalone sessions, and administrative agents remain outside the behavioral cutover.
2. Use a hard cutover with no compatibility aliases or fallback requests. No database schema change is planned.
3. Reconcile documentation after implementation: explicitly accepting public inputs does not prove ownership. Create an ADR only if the implemented decision meets repository criteria.
4. Save the plan during implementation, track unfinished verification, and archive it only after all required work passes.

## Outcome

Completed 2026-10-08.

1. Aggregate actor declarations, manifest specs, admission requests, browser sessions, and React initialization now require the credentials callback path. Public tic-tac-toe and Explorer behavior remains explicit; Shopping keeps Clerk verification and server-derived identity.
2. Aggregate Node snapshot verification, ticket issuance, and reconnects acquire fresh credentials. Service sessions reuse the credential provider while preserving their own direct claims path. No storage schema changed and no compatibility path remains.
3. Extended admission checks cover declaration rejection, callback execution, malformed requests, invalid credentials and returned claims, access capability contents, provisioning, and audit success/failure. Browser and React checks cover provider requirements, direct claims rejection, exact types, fresh credentials, and expected claims mismatch. Existing Repo authorization and actor-free administrative checks remain intact.
4. Scoped Nx typechecks and lint passed for core, system-worker, browser, React, Shopping, and tic-tac-toe; Explorer typecheck and lint passed. The aggregate-administration, initialized-session, and claims checks passed with library dependencies. Existing lint warnings outside this change and the non-blocking Nx Cloud 401 remain.
5. Documentation records claims as server-accepted context and distinguishes public input acceptance from verified ownership. No ADR was created: this implements the agreed admission rule without an additional hard-to-reverse trade-off. Plan 069 was already allocated, so this plan uses 070. Unrelated WIP is preserved.

## Remaining work

None.
