# Async UI ownership audit: commands and live queries

**Date:** 2026-10-15

**Status:** Source research only. Application code was not changed, and no runtime,
browser or test verification was performed for this audit.

## Question and governing distinction

Find other places where the UI reconstructs command delivery or business-work
completion instead of synchronously staging a command and rendering retained
domain state through a live query.

The intended boundary is precise: synchronous success means that the session
committed its local command and optimism. Delivery, authoritative execution and
external work continue asynchronously under their existing runtime owners. A
domain state such as `purchase.paymentState` may legitimately lock an action;
an unresolved journal acknowledgement must not become a generic UI lock.
[Aggregate staging](../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L69-L123),
[service staging](../../packages/core/src/serviceSession/stageServiceSessionCommand.ts),
[checkout domain locks](../../examples/shopping/src/components/CheckoutButton.tsx#L14-L39),
[quotation external request and continuation](../../examples/shopping/src/zerospin/aggregates/user/contracts/getExternalPurchaseQuoteV1.ts),
[payment external request and continuation](../../examples/shopping/src/zerospin/aggregates/user/contracts/processExternalPaymentV1.ts).

This is not a ban on promises, effects or React state. Authentication, file
selection/upload, payment tokenization, browser APIs, component lifecycle and
unsaved form inputs have different owners. The audit follows each suspicious
call to its actual command, query or provider API before recommending deletion.

## Ranked findings

| Priority | Location | Conclusion |
| --- | --- | --- |
| 1 | Red Rope admin `Invitations` and `Partners` | Two forms reconstruct service acknowledgement with journal queries, subscriptions and race-repair state. Remove after consuming synchronous service staging. |
| 2 | Studio `AgentPreview` | Another acknowledgement-derived command barrier. Remove the barrier; preserve diagnostic journal display. |
| 3 | QRK module enrichment and saved spec generation | Browser owns durable backend workflows. Move intent/status/continuations into domain contracts; this requires model changes. |
| 4 | QRK brick update hooks and optimistic shadows; Red Rope ordinary forms | Unnecessary Promise facades around synchronous writes, plus duplicate optimism. Keep genuine browser measurement prerequisites. |
| 5 | Stackshirts payment form | Redundant post-stage `submitted`/command-ID mirror; keep Stripe tokenization and authentication challenges. |

The evidence and migration prerequisites for each ranking follow. Conditional
membership/provisioning/batching changes are separated below.

## Confirmed command-delivery UI defects

### Red Rope Invitations and Partners: acknowledgement state machines in forms

**Priority: consume the synchronous service API, then delete the form machinery.**

Both forms already query their domain rows, but separately retain pending state,
command IDs and refs; read internal `commands.serviceIndex` to detect
confirmation; subscribe to session failures; and await submission while repairing
the race between the returned command ID and confirmation/failure notification.
These are two instances of the old checkout design.
[Invitations state and journal query](../../../redropeparking/apps/admin/app/Invitations.tsx#L25-L68),
[Invitations subscription and submit](../../../redropeparking/apps/admin/app/Invitations.tsx#L70-L138),
[Partners state and journal query](../../../redropeparking/apps/admin/app/partners/Partners.tsx#L29-L78),
[Partners subscription and submit](../../../redropeparking/apps/admin/app/partners/Partners.tsx#L80-L165).

The ordinary commands directly create/update invitation and partner rows. Their
existing domain queries can render those rows after synchronous local staging;
the form can clear its unsaved inputs after local success. Expected later
refusals belong in the session notification layer rather than per-form command
tracking. These commands have no payment-like durable business workflow whose
progress requires a separate pending flag.
[Create invitation](../../../redropeparking/apps/zerospin/src/contracts/createInvitation.ts#L25-L55),
[create partner](../../../redropeparking/apps/zerospin/src/contracts/createPartner.ts#L28-L61),
[update partner](../../../redropeparking/apps/zerospin/src/contracts/updatePartner.ts#L29-L72),
[central notification convention](../patterns/react/session-failure-notification-layer.ts#L5-L24).

**Prerequisite:** Red Rope pins `@zerospin/core` 11.0.0, and its installed service
staging implementation is genuinely async: it waits for `execute.accept`.
Publish/consume the current synchronous API before removing the await and
acknowledgement state. Assigning a Promise to a synchronous result does not
perform this migration.
[Admin dependency](../../../redropeparking/apps/admin/package.json#L9-L14),
[backend dependency](../../../redropeparking/apps/zerospin/package.json#L73-L79),
[installed service submission](../../../redropeparking/apps/admin/node_modules/@zerospin/core/dist/serviceSession/stageServiceSessionCommand.js#L6-L7),
[installed acceptance wait](../../../redropeparking/apps/admin/node_modules/@zerospin/core/dist/serviceSession/stageServiceSessionCommand.js#L47).

### Studio agent command panel: one pending acknowledgement blocks every command

**Priority: remove the submission barrier. Preserve the diagnostic inspector.**

`AgentResults` reads the session's entire `commands` journal and derives a
`pending` flag from missing authoritative `aggregateIndex` values. That flag
disables the command panel for every selected row. The submit callback repeats
the journal scan and throws before staging another command while any earlier
one remains unresolved. This serializes user actions around transport progress.
[Journal query and pending flag](../../packages/studio/src/AgentPreview.tsx#L172-L184),
[disabled panel](../../packages/studio/src/AgentPreview.tsx#L257-L272),
[acknowledgement predicate](../../packages/studio/src/AgentPreview.tsx#L281-L289),
[submit-time barrier](../../packages/studio/src/AgentPreview.tsx#L376-L398).

The owning API already supports agent sessions and returns synchronously. It
evaluates against the transaction's current models, applies optimistic operations,
retains the original and optimism, and increments the local journal index in one
transaction. Subsequent local commands can therefore see preceding optimism
without waiting for authoritative confirmation. The agent runtime already owns
watching staged commands and scheduling delivery.
[Agent staging overload and execution](../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L48-L113),
[evaluate and apply optimism](../../packages/core/src/aggregateSession/evaluateAggregateSessionCommandTx.ts#L64-L104),
[journal transaction](../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts#L27-L122),
[runtime command observer](../../packages/browser/src/agentSession/connectAgentSession.ts#L201-L216).

Delete `hasPendingCommands` and the acknowledgement-derived disable/rejection
path. Keep session readiness, current-row lookup, bound payload values and real
contract refusals. The journal query, selected command ID and
"Staged locally / Confirmed / Rejected" display are valid diagnostic features of
Studio; they must not govern whether an otherwise valid command may be staged.
[Current-row binding and synchronous submission](../../packages/studio/src/AgentPreview.tsx#L400-L424),
[diagnostic command presentation](../../packages/studio/src/AgentPreview.tsx#L292-L303),
[journal inspector output](../../packages/studio/src/AgentPreview.tsx#L426-L447).

## QRK: durable enrichment belongs behind the command

### Eight module forms fetch computed data before saving the domain change

Each of these forms owns an `isSaving` flag, submission/controller bookkeeping,
a metadata RPC, response decoding and a later awaited `onSave`. The brick does
not receive the new intent until the metadata request has succeeded.

| Form | Current browser sequence |
| --- | --- |
| [Instagram](../../../qrk.sh/apps/library/modules/instagram/InstagramForm.tsx#L62-L94) | Profile lookup → decode → save computed module state |
| [GitHub activity](../../../qrk.sh/apps/library/modules/githubActivity/GitHubActivityForm.tsx#L63-L95) | Activity lookup → decode → save |
| [GitHub profile](../../../qrk.sh/apps/library/modules/githubProfile/GitHubProfileForm.tsx#L63-L95) | Profile lookup → decode → save |
| [GitHub repository](../../../qrk.sh/apps/library/modules/githubRepo/GitHubRepoForm.tsx#L68-L100) | Repository lookup → decode → save |
| [Figma thumbnail](../../../qrk.sh/apps/library/modules/figmaThumbnail/FigmaThumbnailForm.tsx#L73-L105) | Thumbnail lookup → decode → save |
| [Link](../../../qrk.sh/apps/library/modules/link/LinkForm.tsx#L49-L77) | Link metadata lookup → save |
| [Map place](../../../qrk.sh/apps/library/modules/mapPlace/MapPlaceForm.tsx#L39-L67) | Place lookup → save |
| [Swatch and icon](../../../qrk.sh/apps/library/modules/swatchAndIcon/SwatchAndIconForm.tsx#L38-L70) | Icon/color lookup → decode → save |

The backend RPC owns lookup/scraping, including a remote Apify operation for
Instagram, while `updateBrick` accepts and persists already-computed state. The
brick has `wallId`, `moduleId` and `state`, with no retained enrichment lifecycle.
The correct replacement is a synchronous module-specific configuration command
that retains input, revision and progress; module-owned external work; a
continuation that checks the revision; and the brick query. This is a domain
migration, not a drop-in removal of `async` from the current forms.
[Lookup RPC owners](../../../qrk.sh/apps/api/modules/LibraryApi.ts#L30-L63),
[remote Instagram operation](../../../qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts#L28-L42),
[computed-state contract input](../../../qrk.sh/apps/library/libraryModule/contracts/updateBrick/UpdateBrickContractV1.ts#L28-L42),
[persist supplied state](../../../qrk.sh/apps/library/libraryModule/contracts/updateBrick/UpdateBrickContractV1.ts#L121-L150),
[brick model](../../../qrk.sh/apps/library/libraryModule/models/brick/makeBrickModel.ts#L15-L28).

### Saved spec generation: request and later write are owned by the page

The brick admin page sets local generation/error state, awaits `generateSpec`,
then stages a spec update. Until the response arrives, the desired saved change
exists only in the mounted browser page. There is no retained request revision
checked before applying that response, so a late response can replace newer
edits. This is a source-level risk, not an observed runtime incident.
[Generation and eventual write](../../../qrk.sh/apps/library/app/bricks/[brickId]/admin/page.tsx#L169-L220),
[generation RPC](../../../qrk.sh/apps/api/modules/LibraryApi.ts#L74-L81),
[generator](../../../qrk.sh/apps/api/modules/generateSpec.ts#L63).

Stage `generateBrickSpec` synchronously with prompt, module, breakpoint and
revision; persist generation progress; execute generation externally; apply its
result through a revision-checked continuation; render the retained result.
By comparison, the module page's `setGeneratedSpec` flow is an unsaved preview,
not a delayed persistence workflow, and should remain transient unless product
requirements change.
[Transient preview](../../../qrk.sh/apps/library/app/modules/[moduleId]/page.tsx#L114-L143).

## Smaller synchronous-path cleanup

### QRK update hooks and optimistic shadows

`useUpdateBrick` wraps every update in SWRMutation, even when its final operation
is synchronous staging. Several consumers also retain `acceptedState`, overriding
the live query until JSON equality is observed. This duplicates session optimism
and can mask rollback if that equality was never observed; no rollback defect was
reproduced during this audit.
[Mutation wrapper](../../../qrk.sh/apps/library/lib/useUpdateBrick.tsx#L63-L65),
[synchronous stage](../../../qrk.sh/apps/library/lib/useUpdateBrick.tsx#L205-L213),
[brick shadow](../../../qrk.sh/apps/library/app/bricks/[brickId]/page.tsx#L29-L70),
[admin shadow](../../../qrk.sh/apps/library/app/bricks/[brickId]/admin/page.tsx#L98-L117),
[Studio shadow and async facade](../../../qrk.sh/apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail.tsx#L102-L113),
[Studio save](../../../qrk.sh/apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail.tsx#L161-L180).

Separate the actual browser DOM measurement prerequisite from the synchronous
domain write, then remove duplicate accepted-state bookkeeping. Measurement is
real browser work and must survive where enabled; it is enabled for the Figma
thumbnail view and defaults off in the generic view.
[Measurement](../../../qrk.sh/apps/library/lib/useUpdateBrick.tsx#L92-L174),
[Figma measurement opt-in](../../../qrk.sh/apps/library/modules/figmaThumbnail/figmaThumbnailView.tsx#L13),
[default](../../../qrk.sh/apps/library/make/makeModuleView.tsx#L246).

### Red Rope ordinary vehicle and garage forms

Several create/update handlers are declared `async` although their work is
synchronous aggregate staging. The modal props require a Promise and await it
before closing. Remove the Promise-only signatures and async wrappers; retain
unsaved inputs and validation. This is smaller syntactic bloat, not another
network acknowledgement barrier.
[Fleet create handlers](../../../redropeparking/apps/web/app/(user)/[username]/FleetDashboard.tsx#L81-L174),
[car detail handlers](../../../redropeparking/apps/web/app/(user)/[username]/car/[id]/CarDetailPage.tsx#L93-L247),
[garage detail handlers](../../../redropeparking/apps/web/app/(user)/[username]/garage/[id]/GarageDetailPage.tsx#L270-L393),
[car modal Promise contract](../../../redropeparking/apps/web/app/(user)/[username]/_components/CarFormModal.tsx#L42-L49),
[car modal submit](../../../redropeparking/apps/web/app/(user)/[username]/_components/CarFormModal.tsx#L80-L120),
[garage modal submit](../../../redropeparking/apps/web/app/(user)/[username]/_components/GarageFormModal.tsx#L70-L94).

### Stackshirts payment form: remove post-stage completion bookkeeping

The payment form tracks `submitted`, a command ID and a session-failure
subscription after synchronously staging `pay`. The same `paymentPurchase` is
already queried; `pay` optimistically creates it as `creating` or changes a
declined purchase to `confirming`. Let that row drive post-stage controls and
centralize command-refusal notifications. There is no acknowledgement wait here.
[Purchase query and form lifetime](../../../stackshirts/apps/storefront/src/screens/Payment.tsx#L97-L134),
[local command bookkeeping](../../../stackshirts/apps/storefront/src/screens/Payment.tsx#L150-L173),
[record command and submitted flag](../../../stackshirts/apps/storefront/src/screens/Payment.tsx#L228-L259),
[optimistic pay states](../../../stackshirts/apps/storefront/src/domain/payments/contracts/payV1.ts#L37-L85).

The parent unmounts the form while creating/confirming/processing and remounts it
on decline. Consequently this audit does **not** establish a stuck decline/retry
bug. Keep the browser-operation guard and busy state for Stripe Elements
submission, confirmation-token creation and 3DS; those are real browser/provider
prerequisites. The private payment-action read returns an ephemeral secret for
authentication, not checkout submission completion.
[Form lifetime](../../../stackshirts/apps/storefront/src/screens/Payment.tsx#L117-L134),
[Stripe prerequisites](../../../stackshirts/apps/storefront/src/screens/Payment.tsx#L174-L227),
[private action boundary](../../../stackshirts/apps/storefront/src/server/readPaymentAction.ts#L13-L49),
[secret read](../../../stackshirts/apps/storefront/src/payments/readPaymentAction.ts#L11-L33).

## Conditional domain and policy changes

1. **Red Rope signup membership handoff:** `SignedUpHandoff` reads command
   `aggregateIndex`, stages intake from an effect, subscribes to failures and
   gates HTTP membership lookup on command confirmation. But that HTTP resolver
   performs invitation lookup and privileged `acceptInvitation`; optimistic
   `member.fleetSize` does not establish authoritative membership. Replace the
   bridge only after retaining membership-resolution progress and moving the
   privileged workflow behind a backend continuation exposed to the restricted
   intake actor's query.
   [UI journal and orchestration](../../../redropeparking/apps/web/app/(user)/signed-up/SignedUpHandoff.tsx#L30-L160),
   [HTTP hook](../../../redropeparking/apps/web/components/useMembershipStatus.ts#L13-L59),
   [resolver invitation work](../../../redropeparking/apps/zerospin/src/membership/resolveMembership.ts#L98-L192),
   [optimistic intake attributes](../../../redropeparking/apps/zerospin/src/contracts/submitIntake.ts#L111-L130),
   [intake selection](../../../redropeparking/apps/zerospin/src/member/actors/intake/intakeActor.ts#L47-L57).
2. **Red Rope public partner intake:** the contact page awaits an HTTP bridge
   whose privileged command explicitly requires system-only claims. Removing it
   requires a restricted public submission actor/model/query and identity and
   idempotency decisions; the existing admin actor admits admins only.
   [UI](../../../redropeparking/apps/web/app/(visitor)/partner/intake/contact-info/page.tsx#L31-L66),
   [HTTP owner](../../../redropeparking/apps/web/app/api/partner-intake/route.ts#L56-L102),
   [system-only guard](../../../redropeparking/apps/zerospin/src/contracts/createPartnerFromIntake.ts#L37-L43),
   [admin admission](../../../redropeparking/apps/zerospin/src/admin/actors/adminActor.ts#L24-L28).
3. **Stackshirts debounced design drafts:** `DraftProvider` owns a second mutable
   design copy, pending counters, registrations, dirty/latest refs, a 400ms
   timer and pagehide/unmount flush. Navigation, account switching and saving
   presentation accommodate this buffer. Existing attribute commands are
   synchronous and accept incomplete text, so immediate staging could eliminate
   much of it **if delayed batching is no longer wanted**. Do not silently
   remove that policy or conflate all unsaved form input with domain duplication.
   [Draft buffer](../../../stackshirts/apps/storefront/src/hooks/DraftProvider.tsx#L32-L67),
   [flush and timer](../../../stackshirts/apps/storefront/src/hooks/DraftProvider.tsx#L95-L155),
   [sync saves](../../../stackshirts/apps/storefront/src/screens/Design.tsx#L73-L79),
   [navigation flush](../../../stackshirts/apps/storefront/src/hooks/useGuestNavigation.ts#L7-L14),
   [navigation wrapper](../../../stackshirts/apps/storefront/src/components/DesignLink.tsx#L8-L14),
   [account switch](../../../stackshirts/apps/storefront/src/sessions/WorkspaceOwner.tsx#L23-L42),
   [saving display](../../../stackshirts/apps/storefront/src/components/WorkspaceFrame.tsx#L38-L63),
   [stack attribute command](../../../stackshirts/apps/storefront/src/domain/contracts/updateStackAttributesV1.ts#L17-L41),
   [shirt attribute command](../../../stackshirts/apps/storefront/src/domain/contracts/updateShirtAttributesV1.ts#L18-L51).

Stackshirts' pre-payment localStorage intent is not an async violation: the
browser has not obtained the Stripe confirmation token required by `pay`, and
the documented design intentionally keeps this stage local. Making it a queried
row would require a new preparation contract/state, not merely removing an await.
[Buy action](../../../stackshirts/apps/storefront/src/components/BuyShirtButton.tsx#L16-L41),
[local intent](../../../stackshirts/apps/storefront/src/payments/checkoutIntent.ts#L21-L55),
[documented ownership](../../../stackshirts/wiki/architecture/storefront.md#L56-L58).

QRK image upload, autocomplete/icon search, animation lifecycle, Clerk hydration
and external navigation are outside the command-completion findings. In
particular, local `File` and upload progress belong to the browser until upload
has produced a usable resource.
[Image upload](../../../qrk.sh/apps/library/modules/image/ImageForm.tsx#L43-L82),
[animation lifecycle](../../../qrk.sh/apps/library/lib/WallBreakpointPane.tsx#L41-L77),
[purchase navigation](../../../stackshirts/apps/storefront/src/screens/Purchase.tsx#L90-L97).

## Mentor Mailbox: sound active usage and unused residue

No active first-party command acknowledgement/polling/journal/HTTP-submission
violation was found in the scoped app/mentor/admin search. Representative UI
stages star/unstar, create and calendar update synchronously, while querying
projects and handling failures through the session notification layer.
[Star/unstar](../../../mentormailbox/apps/app/src/containers/ListView/Project.tsx#L37-L49),
[project query](../../../mentormailbox/apps/app/src/app/(private)/planner/personal/page.tsx#L35-L50),
[create and immediate input clear](../../../mentormailbox/apps/app/src/app/(private)/planner/personal/page.tsx#L84-L105),
[calendar update](../../../mentormailbox/apps/app/src/app/(private)/planner/PlannerCalendar.tsx#L161-L168),
[session notifications](../../../mentormailbox/apps/app/src/zerospin/studentSession.ts#L55-L60).

Unused residue is a separate cleanup category: `LoadingButton` accepts a Promise
click and owns a spinner; `DropdownMenuItemAndConfirm` awaits confirmation through
it; `wait` and `sleep` expose timer promises. No first-party consumers were found
for the confirmation component or timer helpers, and `LoadingButton` was only
referenced by that confirmation component. Confirm export/reference scope before
deleting; these are not active UI incidents.
[Loading button](../../../mentormailbox/apps/app/src/components/LoadingButton.tsx#L21-L50),
[confirmation wrapper](../../../mentormailbox/apps/app/src/components/DropdownMenuItemAndConfirm.tsx#L29-L35),
[wait](../../../mentormailbox/apps/app/src/lib/wait.ts#L1-L9),
[sleep](../../../mentormailbox/apps/app/src/lib/sleep.ts#L1-L5).

## Current examples that already have the intended shape

1. **Shopping:** `CheckoutButton` stages one `checkout` command and reads the
   cart, its items and its linked purchase. `ProductCard` stages `addToCart`
   synchronously; cart quantity/removal controls synchronously validate and stage
   their domain commands. There is no component acknowledgement wait in those
   paths.
   [Checkout](../../examples/shopping/src/components/CheckoutButton.tsx#L12-L67),
   [add to cart](../../examples/shopping/src/components/ProductCard.tsx#L30-L91),
   [quantity and removal](../../examples/shopping/src/components/CartItemQuantityControls.tsx#L17-L42).
2. **Tic-Tac-Toe:** the board synchronously stages `createGame` or `playX` and
   renders the queried game's `turn`, `outcome` and `computerMoveFailure`. The
   server adapter queues `playExternalOMove`; its external request owns choosing the
   computer move, and its continuation updates the same game. The UI's local
   error string presents a direct staging refusal rather than mirroring
   asynchronous progress.
   [Board query and commands](../../examples/tic-tac-toe/src/app.tsx#L41-L105),
   [server scheduling](../../examples/tic-tac-toe/src/contracts/playXServerV1.ts#L16-L35),
   [external request](../../examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts#L23-L27),
   [continuation](../../examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts#L58-L80).

Studio's `AgentExplorer` effect owns session creation/bootstrap/disposal, rather
than chaining application commands. Its repository-table SWR hook performs a
diagnostic read with polling disabled; manual refresh is an explicit inspector
action. Shopping's service-worker update dialog observes browser connectivity
and service-worker installation. These are legitimate lifecycle or browser API
boundaries, not checkout-style command completion machinery.
[Agent lifecycle](../../packages/studio/src/AgentExplorer.tsx#L58-L104),
[diagnostic read](../../packages/studio/src/useRepoTableData.ts#L14-L33),
[explicit inspector refresh](../../packages/studio/src/RepoTablePane.tsx#L83-L90),
[service-worker update](../../examples/shopping/src/components/AppUpdateDialog.tsx#L6-L31),
[activation action](../../examples/shopping/src/components/AppUpdateDialog.tsx#L68-L76).

## Zerospin Cloud: larger domain migration candidates

These first-party Cloud/Admin components await real authenticated RPC requests;
their current APIs do not expose local session staging. Treat them as candidates
for a deliberate command/domain-model migration, not as places where deleting
`await` completes the fix.

| Candidate | Present UI ownership | Actual owner and prerequisite |
| --- | --- | --- |
| Admin `CreateSystemDialog` | Await creation, disable through `form.isSubmitting`, refresh server data after success. | `AdminApi.createSystemRecord` is a server RPC. A synchronous creation design first needs a session-owned request/model and locally allocated identity. |
| Cloud `NewSystemDialog` | Await creation, use returned system ID to navigate, then refresh. | `CloudApi.createSystemRecord` allocates the ID server-side and writes `CloudRepo`; there is no local staged system row. |
| Shared `ZerospinKeysCard` | Await `onCreateKeys` inside a transition; show request-local progress/error, then refresh server data. | Key generation calls Clerk and persists a key pair. A command/query design needs a retained provisioning state and backend external work, while preserving the private credential boundary. |

Sources:
[Admin creation UI](../../../zerospin-cloud/admin/src/components/dashboard/CreateSystemDialog.tsx#L39-L63),
[Admin pending presentation](../../../zerospin-cloud/admin/src/components/dashboard/CreateSystemDialog.tsx#L124-L141),
[Cloud creation UI](../../../zerospin-cloud/cloud/app/(authed)/NewSystemDialog.tsx#L40-L68),
[Cloud creation owner](../../../zerospin-cloud/apis/src/CloudApi/CloudApi.ts#L49-L82),
[CloudRepo write](../../../zerospin-cloud/apis/src/CloudRepo/CloudRepo.ts#L75-L113),
[keys UI](../../../zerospin-cloud/ui/src/components/ZerospinKeysCard.tsx#L156-L180),
[development key creation](../../../zerospin-cloud/apis/src/CloudApi/createUserDevKeyPair.ts#L68-L118),
[production key creation](../../../zerospin-cloud/apis/src/AdminApi/createSystemProductionKeyPair.ts#L56-L108).

The Cloud client helper obtains a Clerk token, opens an HTTP RPC session and
awaits its result. Changing its name or hiding the same wait in another wrapper
would not create synchronous local semantics. Clerk organization creation and
active-organization selection are also genuine external authentication work;
clipboard writes and syntax highlighting are presentation/browser work.
[Cloud RPC helper](../../../zerospin-cloud/cloud/lib/useCloudApi.ts#L18-L43),
[organization creation](../../../zerospin-cloud/cloud/app/(authed)/NewOrganizationDialog.tsx#L25-L44),
[organization activation](../../../zerospin-cloud/cloud/app/(authed)/OrganizationSwitcherPopover.tsx#L32-L38),
[clipboard and highlighting](../../../zerospin-cloud/ui/src/components/ZerospinKeysCard.tsx#L38-L73),
[clipboard feedback](../../../zerospin-cloud/ui/src/components/ZerospinKeysCard.tsx#L110-L126).

## Duplicate and historical checkouts

`zerospin-system-api` is a linked checkout sharing this repository's Git common
directory, confirmed with `git rev-parse --git-common-dir`. Its old Shopping
button still contains the original smell: `waitForCartEdits`, command-journal
inspection, database/store subscriptions and a timer. `useCartCommand` mirrors
pending commands; `ensureCart` waits for creation before another command. Count
this as the same superseded design in another checkout, not another product.
Its older service submission API genuinely awaits `execute.accept`, so adopting
the current synchronous staging contract is a prerequisite to removing the wait.
[Old checkout](../../../zerospin-system-api/examples/shopping/src/components/CheckoutButton.tsx#L10-L70),
[old command hook](../../../zerospin-system-api/examples/shopping/src/hooks/useCartCommand.ts#L8-L59),
[old cart creation chain](../../../zerospin-system-api/examples/shopping/src/zerospin/ensureCart.ts#L10-L106),
[older service API](../../../zerospin-system-api/packages/core/src/serviceSession/stageServiceSessionCommand.ts#L22-L34),
[older acceptance wait](../../../zerospin-system-api/packages/core/src/serviceSession/stageServiceSessionCommand.ts#L91-L94).

The historical `zerospin-shared-worker` checkout also chains `createCart` then
`addToCart` in an async click handler. Its older browser command API is genuinely
async and declares creation and addition separately. It demonstrates the same
ownership issue but is not an independent active-product priority. Its Git
common directory was unavailable during inventory, so its provenance should not
be treated as an active managed worktree.
[Historical product button](../../../zerospin-shared-worker/examples/shopping/src/app/(authed)/ProductCard.tsx#L65-L94),
[historical browser API](../../../zerospin-shared-worker/packages/react/src/makeBrowserSession.ts#L27-L28),
[historical cart contracts](../../../zerospin-shared-worker/examples/shopping/src/zerospin/contracts.ts#L74-L111).

## Scope and limits

The source search covers Zerospin's Shopping and Tic-Tac-Toe examples, Studio,
QRK Library/Studio, Red Rope web/admin, Stackshirts storefront, Mentor Mailbox
app/mentor/admin and first-party `zerospin-cloud/{cloud,admin,ui,website}`. Searches included async
handlers/wrappers, effects, local pending state, command IDs, acknowledgement
columns, manual subscriptions, timers and polling. Candidate call paths were
traced to their actual command/query/provider owners. Generated declarations,
vendored copies and generic UI primitives were excluded from violation counts.

A bounded sibling inventory found no Zerospin application imports in
`bluechipcar`, `bluechipcars-api`, `epluribus-machina`, `eve-reviewer`,
`morganatwork` or `cloudflare-counter`; that inventory is not a complete async UI
audit of those unrelated applications. Findings describe the working trees on
the date above, including existing uncommitted changes. No authorship inference
is made from a suspicious code shape.
