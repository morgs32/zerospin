# Five schema membership guards

## Agreed behavior and scope

1. Extend the Studio theme trial to five specific literal-membership checks. Replace the boolean chains with Effect 4 `Schema.Literals` and `Schema.is`, preserving accepted values, rejection behavior, and short-circuit placement.
2. Consolidate repeated value declarations where the same schema can own the guard, type, and options. Preserve dynamic equality comparisons, component signatures, error messages, and persisted metadata.
3. This is a bounded implementation batch. A repository-wide conditional-to-schema convention remains undecided. Preserve unrelated work in this dirty checkout.

## Implementation

1. **Session command WebSocket paths:** in `packages/system-worker/src/SystemRepo/fetch/fetch.ts:89`, add a private module-level `SessionCommandWebSocketPathSchema = Schema.Literals(['/ws-aggregate-session-commands', '/ws-service-session-commands'])`. Replace the two negative pathname comparisons with `!Schema.is(SessionCommandWebSocketPathSchema)(url.pathname)`. Add `Schema` to the existing Effect import. Preserve the preceding `/ws-system-logs` branch, the 404 response, and subsequent upgrade/ticket handling.
2. **Forbidden actor-pattern tokens:** in `packages/core/src/identity/make/makeActorIdentity/IdentitySchema/IdentitySchema.ts:43`, add a private module-level `ForbiddenActorPatternTokenSchema = Schema.Literals(['(', ')', '*'])`. Replace the three positive token comparisons with `Schema.is(ForbiddenActorPatternTokenSchema)(token.type)`. Keep the existing rejection message and the following parameter-token, whole-segment, and name rules.
3. **Editable form controls:** in `packages/devtools/src/ZerospinDevtools.tsx:488`, add a private module-level `EditableFormControlTagNameSchema = Schema.Literals(['INPUT', 'TEXTAREA', 'SELECT'])` and import `Schema` from `effect`. Replace only the three tag-name clauses with `Schema.is(EditableFormControlTagNameSchema)(target.tagName)`. Keep the `HTMLElement` protection, content-editable and ARIA textbox checks, and Escape handling before this branch.
4. **DevTools trigger positions:** add a focused shared `packages/devtools/src/TriggerPositionSchema.ts` exporting `TriggerPositionSchema = Schema.Literals(['bottom-right', 'bottom-left', 'top-right', 'top-left', 'middle-right', 'middle-left'])`. Infer the existing public `ITriggerPosition` in `types.ts` as `typeof TriggerPositionSchema.Type`, using a type-only import. In `SettingsRoute.tsx:326`, replace the six negative comparisons with `!Schema.is(TriggerPositionSchema)(position)`. Generate `<option>` elements from `.literals`, with `key` and `value` set to the position and labels produced by `position.split('-').map(uppercaseFirstLetter).join(' ')`. Preserve the existing option order, capitalization, invalid-value no-op, and store update. Package export mappings and the public type's accepted values remain the same.
5. **TicTacToe marks:** in `examples/tic-tac-toe/src/gameV1.ts:34`, add a private module-level `GameMarkSchema = Schema.Literals(['X', 'O'])`. Use `.literals` for the existing `turn` enum. Replace only `(mark === 'X' || mark === 'O')` with `Schema.is(GameMarkSchema)(mark)`, retaining both dynamic board-cell comparisons. Keep the `outcome` return type, outcome enum, and fallback logic.
6. After verification, review documentation against the result. These helper schemas introduce no new domain terminology or architectural decision, so no glossary entry, ADR, or standing pattern is expected. Record completion and verification here and archive the plan when its remaining work is empty.

`+` creates; `~` modifies.

```text
zerospin/
  packages/
    system-worker/src/SystemRepo/fetch/
      ~ fetch.ts
    core/src/identity/make/makeActorIdentity/IdentitySchema/
      ~ IdentitySchema.ts
    devtools/src/
      + TriggerPositionSchema.ts
      ~ types.ts
      ~ SettingsRoute.tsx
      ~ ZerospinDevtools.tsx
  examples/tic-tac-toe/src/
    ~ gameV1.ts
  wiki/archive/plans/
    + 087-plan-schema-membership-guards.md
```

## Verification

1. Run temporary in-memory comparisons between the old membership predicates and the actual new schemas. Cover every accepted literal and rejected values including `null`, `undefined`, empty strings, changed casing, unknown strings, numbers, arrays, and objects. For paths, also cover trailing slashes and confirm `/ws-system-logs` still takes its earlier branch.
2. Verify all six trigger option values and labels in their existing order. Confirm `ITriggerPosition` has the same union through the DevTools typecheck. Review the shortcut diff to confirm content-editable elements, ARIA textboxes, ordinary elements, and Escape retain their existing branches.
3. Compare old and new TicTacToe outcome functions across all 19,683 nine-cell boards over `X`, `O`, and `.`, plus empty, short, and unexpected-character boards. Review that only literal recognition and the equivalent turn enum declaration changed.
4. Run one scoped graph: `pnpm nx run-many -p @zerospin/core system-worker @zerospin/devtools tic-tac-toe -t ts lint`, preserving required library dependencies and caching. TicTacToe's inferred `tsc:typecheck` command only reports a disabled check; use its actual `ts` task.
5. Run `pnpm nx run system-worker:authorization-provisioning:check` for the existing real WebSocket forwarding seam. Run `pnpm exec oxfmt --check` on only the seven implementation files and this plan, and `git diff --check` on those files. No new test suite or browser harness is needed for this literal-membership batch.
6. Diagnose failures only far enough to distinguish this batch from concurrent WIP. Resolve in-scope failures and report any external blocker before expanding scope.

## Outcome and verification — 2026-10-09

1. Implemented all five guards and the trigger-position/type/options and game-turn declaration consolidation. Existing rejection behavior, dynamic comparisons, and public type values are preserved.
2. Actual path/token schema predicates matched their previous conditions. Nine router cases passed, including exact pathname rejection, upgrade/ticket errors, and system-log forwarding through its preceding branch.
3. Actual DevTools schemas matched the previous predicates for 21 position inputs and 20 editable-tag inputs. All six option values, labels, and their order matched. The shortcut's HTMLElement, content-editable, ARIA textbox, and Escape branch placement is unchanged.
4. Actual original and revised TicTacToe outcome functions matched across all 19,683 nine-cell X/O/. boards and 20 additional empty, short, unexpected-character, and overlong strings. The mark schema matched the old guard for 16 inputs.
5. `pnpm nx run-many -p @zerospin/core system-worker @zerospin/devtools tic-tac-toe -t ts lint` passed, including its required library dependencies. Lint reported 30 existing warnings in untouched files and no errors.
6. `pnpm nx run system-worker:authorization-provisioning:check` passed its real Workerd owner RPC, provisioning, capability, snapshot, membership, and single-use bound-ticket checks. Nx Cloud reported a non-blocking access warning (401); the local tasks completed successfully.
7. Scoped formatting and diff checks passed. No new domain terminology or qualifying architectural decision was introduced; glossary, ADR, and standing pattern changes were unnecessary. The plan is complete and archived.

## Remaining work

None.
