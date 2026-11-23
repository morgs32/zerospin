# Command and live-query UI cleanup

**Date:** 2026-10-15

**Status:** Complete. All 24 child plans are implemented, verified with the permitted checks, and archived.

**Evidence:** [Source audit](../../research/async-ui-command-query-audit.md).

## Result

Application forms synchronously stage their domain commands and render retained business progress through the owning session query. Zerospin owns command persistence, background delivery, acknowledgement and reconciliation. Removed UI Promise facades, acknowledgement watchers, delayed batching, duplicate optimistic copies and route-refresh completion tracking.

The user clarified that this is a UI-ownership cleanup, not a requirement for backend durability everywhere. Library remains standalone. QRK provider execution runs at the existing Library/Studio editing-session lifetime, outside form components. Disposing that owner fences late writes and releases RPC references; already-sent HTTP/provider work may still finish. Actual uploads, Stripe browser actions, searches, measurements and private credential reads retain their real async boundaries.

## Implemented children

| Plan | Owner / instance | Outcome |
| --- | --- | --- |
| [161](161-plan-synchronous-staging-consumer-release.md) | Shared SDK | Verified and consumed synchronous staging in exact 11.3.2. |
| [162](162-plan-studio-command-submission.md) | Studio | Removed command-acknowledgement submission gates; retained diagnostics. |
| [163](163-plan-redrope-invitations-sync-command.md) | Red Rope invitations | Direct synchronous service staging. |
| [164](164-plan-redrope-partners-sync-command.md) | Red Rope partners | Direct synchronous service staging. |
| [165](165-plan-redrope-fleet-forms-sync-commands.md) | Red Rope fleet forms | Synchronous form callbacks and all callers. |
| [166](166-plan-redrope-membership-command-query.md) | Red Rope membership | Revision-checked resolution and queried routing; backend authority retained. |
| [167](167-plan-redrope-public-partner-intake.md) | Red Rope public intake | Restricted submission identity and private queried receipt. |
| [168](168-plan-qrk-synchronous-brick-saves.md) | QRK brick saves | Synchronous saves and queried saved state; real measurement remains separate. |
| [169](169-plan-qrk-instagram-command-query.md) | QRK Instagram | Module-owned local resolution and guarded completion. |
| [170](170-plan-qrk-github-activity-command-query.md) | QRK GitHub activity | Module-owned local resolution and guarded completion. |
| [171](171-plan-qrk-github-profile-command-query.md) | QRK GitHub profile | Module-owned local resolution and guarded completion. |
| [172](172-plan-qrk-github-repository-command-query.md) | QRK GitHub repository | Module-owned local resolution and guarded completion. |
| [173](173-plan-qrk-figma-thumbnail-command-query.md) | QRK Figma thumbnail | Provider resolution separated from real DOM measurement. |
| [174](174-plan-qrk-link-command-query.md) | QRK link | Module-owned local metadata resolution and guarded completion. |
| [175](175-plan-qrk-map-place-command-query.md) | QRK map place | Browser search retained; selected intent stages synchronously. |
| [176](176-plan-qrk-swatch-icon-command-query.md) | QRK swatch/icon | Saves the SVG returned by search; redundant lookup removed. |
| [177](177-plan-qrk-saved-spec-generation.md) | QRK saved specs | Synchronous intent, queried generation and revision-checked spec application. |
| [178](178-plan-stackshirts-payment-query-state.md) | Stackshirts payment | Removed post-stage mirrors; retained Stripe browser prerequisites. |
| [179](179-plan-stackshirts-immediate-design-staging.md) | Stackshirts drafts | Immediate staging replaces delayed batching and navigation flushes. |
| [180](180-plan-mentormailbox-unused-async-ui.md) | Mentor Mailbox | Removed unreachable async controls/helpers. |
| [181](181-plan-cloud-admin-system-creation.md) | Cloud Admin | One canonical native control-plane owner and synchronous creation. |
| [182](182-plan-cloud-system-creation.md) | Cloud organization UI | Synchronous creation/navigation and session-backed list/detail/sidebar. |
| [183](183-plan-cloud-key-provisioning.md) | Cloud keys | Queried provisioning, private issuance steps and authenticated credential reads. |
| [184](184-plan-qrk-library-backend-ownership.md) | QRK Library ownership | Library remains standalone; provider work belongs to the editing session. |

## Verification

1. Zerospin Studio/dependency builds, typecheck and lint passed. The compatible SDK release was built from clean committed baseline `41d6187899` plus the narrow synchronous-staging change, excluding primary-checkout WIP. All 19 packages were published as exact 11.3.2, and actual registry tarballs were checked for synchronous JavaScript/types, corrected guidance, SQLite WASM and the bundled worker. Earlier artifacts remain unchanged.
2. Red Rope frozen install, Admin/Web production builds, existing Storybook build and fresh isolated backend spec startup passed. Installed SDK artifacts and the retained consumer patch were checked; independent review covered membership/intake authority and failure recovery.
3. QRK Library reusable/app builds, Studio app build and API Worker dry-run passed. After review, the saved generation refusal presentation was fixed and the Library app build passed again. Request/revision guards, stale response handling and transport limits were reviewed.
4. Stackshirts production build and Mentor Mailbox app build passed. Stripe/provider actions were preserved and not exercised with real charges.
5. Cloud exact frozen installation, API library/types, Worker dry-run, fresh isolated native owner/bootstrap startup and both Next app builds passed. Independent review covered actor registrations, organization isolation, scoped private key attempts, canonical metadata ownership and principal/scope changes in credential reads.

No tests, fixtures, runners or check gates were created. Existing Storybook support and unrelated WIP were preserved. Existing user storage was not reset; incompatible schemas were inspected only in isolated storage. Real provider delivery, authentication, key issuance and charges were not exercised or claimed as verified. Local checks succeeded despite the existing Nx Cloud access401 warning where reported.

## Remaining work

None.
