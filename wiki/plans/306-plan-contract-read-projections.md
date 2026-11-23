# Contract read projections

> Relevant remaining work is tracked in [MOR-468](https://linear.app/morganatwork/issue/MOR-468/integrate-contract-read-projections-and-verify-consumer-cutover). This file preserves the source plan and its evidence.

**Status:** In progress in the isolated read-projections worktree. No consumer storage has been reset.

## Problem

Contracts currently declare exact model objects for reads. Both an ordinary guard and its program receive a database scoped to those models, and System construction and portable SystemSpec validation require the same exact model versions as the owner release. Consequently, adding `hostname` to Site forces `updateTextBrick` to change even though its guard only reads `Site.userId`. Mutation operations have a separate, valid need for an exact model version.

Replace contract and reusable-guard read declarations with explicit, field-level read projections. Preserve the existing selected-row authority boundary and exact mutation permissions. This is a clean-slate development cutover across Zerospin and its consumers, not a compatibility layer or production deployment.

## Agreed behavior

1. Keep the contract property named `models`. Every declared read lists the top-level fields explicitly, using an existing model declaration as the source of their identity and read shape. The model ID is implicitly available for lookups; an empty field list supports ID-only reads. A contract can use the same projections in its guard and program. Do not retain an implicit full-model read declaration as a compatibility path.
2. Projections limit returned fields, filters, ordering and relational reads in both inferred types and runtime execution. Querying or obtaining an undeclared field fails rather than creating an untracked dependency. Whole JSON fields may be selected; nested JSON projections are out of scope.
3. A projected reference supplies its existing relation when the referenced model is also projected. For example, projecting `placement.brickId` and Brick permits `with: { brick: true }`, limited to Brick's projected fields. Preserve forward and inverse relation behavior only where the required reference and both model projections are declared; do not infer wider read authority.
4. Bind each projection to the owner release's selected model by stable model identity and compatible read shape, not the version used as the source declaration. A `siteV2` adding `hostname` is compatible with a projection of `siteV1.userId`. The projected field's type, nullability, model identity, relevant reference identity and readable relation behavior must agree. A nullable field becoming required is a shape change for this design. Creation defaults do not affect read compatibility. A reference's uniqueness must also match when both sides are projected, because it determines whether the inverse relation returns one row or many; other uniqueness changes do not affect reads.
5. A projected JSON field requires the exact same Effect schema object within each loaded System. Portable metadata records and compares the JSON shape; as with authored callbacks, authors must version a contract when codec behavior changes across deployments. Separate but equivalent schema objects do not satisfy in-process compatibility.
6. A changed source model version does not change a contract's portable read requirement when the selected fields' shapes are unchanged. A changed projection is an authored contract change and follows its normal versioning and payload-adaptation rules. Reject an owner release with an incompatible projected model when constructing the System, before deployment or storage writes.
7. Retain `operations` as the separate write grant. Model operations remain bound to their exact model versions and retain exact encoding, inverse operations and replay behavior. For Actor commands, require the Actor to expose all projected read fields on the applicable selected rows; it need not expose unrelated fields on read-only models. Preserve the existing complete-canonical-model exposure rule for models the command writes. Actor row selections and all other authority boundaries remain in force.
8. Apply projections consistently to Aggregate and Service ordinary contracts and recorded external continuations. The existing `makeGuard` utility declares projections; its caller must supply at least the guard's projected fields. If the in-progress server-only Aggregate contract extension is present when this plan is implemented, it declares its own projections independently of the shared contract and reads through its existing server-only authority. Do not expose its fields through Actor selections or browser contracts.
9. Keep Actor and Agent selection APIs and their versioned model bindings unchanged. Add a Zerospin TODO to research whether those APIs should use projections in the future. Do not turn that research into an implementation dependency for this plan.
10. The user authorized resetting Zerospin-owned state in local and development environments across consumer apps. Production and other providers' accounts, credentials, uploaded files and storage are outside that authorization. Inventory and identify each exact affected store before resetting it. No storage is reset during planning.
11. Preserve every registered owner release and every canonical selection; the user alone may handwrite any future registry removal or canonical change. Reset authorization does not authorize agents to rewrite those selections. Preserve unrelated work and avoid editing installed or vendored Zerospin packages in consumers.

## Illustrative contract

This is the desired authoring shape; callback bodies and unchanged payload, claims and failures are abbreviated. `fields` is an explicit array, not a list of all fields implicitly supplied by the model.

```ts
const updateTextBrick = makeAggregateContractRelease(
  defineAggregateContract('updateTextBrick'),
  {
    version: 1,
    // ...payload, claims and failures...
    models: {
      brick: { model: brickV1, fields: ['pageId', 'moduleId'] },
      page: { model: pageV1, fields: ['siteId'] },
      site: { model: siteV1, fields: ['userId'] },
      user: { model: userV1, fields: ['clerkUserId'] },
    },
    // This operation stays tied to the exact Brick version.
    operations: { updateBrick: brickV1.operations.update },
    guard: Effect.fn('updateTextBrick.guard')(function* (props) {
      const { db, payload, claims, failures } = props;
      // Existing Brick -> Page -> Site -> User ownership lookup uses
      // db.models and findFirst; only IDs and the fields above are readable.
    }),
  },
);
```

Changing the projection source from `siteV1` to a compatible `siteV2` does not itself change the contract's portable facts. Adding `name` to the fields list does. Adding `hostname` to Site alone does not. `brickV1.operations.update` still prevents a release selecting a different Brick version from reusing that exact write grant without a deliberate operation and contract update.

## Implementation

1. Trace current native declaration construction, selected Actor reads, Agent command reads, `makeGuard`, optimistic session staging, authoritative Aggregate/Service execution and external continuations. Identify the exact in-progress server-extension worktree and coordinate its application rather than editing another thread's work. Use existing boundaries and avoid introducing consumer-side adapters or compatibility-only machinery.
2. Change ordinary and external contract model declarations to explicit `{ model, fields }` projections. Infer field names, ID type, decoded field types and relationships from the source model without unsafe casts. Validate field names and duplicates and capture immutable read requirements; keep model operation descriptors exact and independent. Adapt `makeGuard` to project only fields already supplied by its caller.
3. At System construction, validate each contract projection against the exact model selected by each owning release, including stable identity, compatible field shape and runtime JSON schema identity. Reject missing fields, changed nullability, incompatible reference/relationship behavior or incompatible codecs. Check Actor and Agent command capabilities against the projected fields without changing their selection APIs; preserve the complete-model rule for Actor mutation operations.
4. Rework the existing contract read database to bind a projection to the selected runtime model while restricting its result, predicates, ordering and related reads to declared fields. Derive relations from projected references and projected destination models. Apply the same behavior to browser optimistic staging, server Actor-visible reads, System/Agent reads, external continuations and the existing harness; never widen Actor selections or create or synchronize another resource table. Preserve command savepoints, typed failures, operation application and replay invariants.
5. Replace exact contract read-model version bindings in native validation, portable Contract specs, SystemSpec reference validation and session/Actor/Agent capability checks with stable model identity plus normalized projected read shapes. Exclude source model version, creation defaults and uniqueness that cannot affect a projected inverse relation from the portable read requirement. Preserve exact release model bindings, write operation version bindings, complete SystemSpec equality/hash checks, owner-local identity and immutable declaration facts. Update actual SystemSpec consumers such as diagrams, Studio, CLI or Cloud only where their current code uses the changed facts; do not invent a parallel registry.
6. Apply the same projected-read requirements to server-only contract extensions if the implementation is present. Keep the extension's read metadata and validation bound to its owning release and out of browser-facing Actor capabilities. Do not duplicate unfinished domain-assignment work or change its continuation behavior as part of this plan.
7. Move Zerospin examples, tests, documentation and every in-scope consumer's authored contract and reusable-guard reads to explicit fields. Discover the complete current consumer set before changing pins; the initial direct-dependency search found QRK, Mentor Mailbox, Red Rope Parking, Intervals, Zerospin Cloud, Zerospin Email and Stackshirts. Inspect each repository's status and instructions, preserve all unrelated changes, make framework changes in Zerospin, publish an exact compatible package release, and use package-manager commands to update consumer dependencies and lockfiles. Do not alter installed package files or vendored sources. Include nonstandard consumers discovered during inventory.
8. Inventory exact local and deployed development Zerospin stores, browser Node/replica data and affected owners for each consumer, distinguishing production and non-Zerospin providers. Verify the inventory and execute only the already-authorized local/development Zerospin resets necessary for the cutover. Preserve Clerk accounts, credentials, uploaded assets, production storage and unrelated systems. Do not silently perform a reset during a build, test or deployment. If the exact identity, environment or ownership of a store cannot be established, leave it untouched and report the blocker.
9. Update `TODOS.md` with the agreed follow-up to research Actor and Agent selection projections. After implementation, reconcile the glossary and affected architecture/Fragment guidance with actual behavior. Review ADR 020 and ADR 026 and update or supersede their affected claims only as warranted by the implemented result. Create a new ADR only if the decision is hard to reverse, surprising without context and reflects a real trade-off.

## Verification

1. Extend existing Zerospin tests and typecheck seams; do not create new test files, fixtures, runners or configurations unless separately authorized. Prove selected-field inference, ID access, rejection of undeclared fields in results, filters and ordering, and nested relation reads bounded by both projections.
2. Prove System construction accepts Site versions that add unrelated fields or change creation defaults, rejects changed type/nullability/reference shape and missing fields, and enforces identical in-process JSON schema objects. Verify portable specs remain equal when only the compatible source model version changes, and change when the projected read shape changes; preserve exact mutation-operation validation.
3. Exercise a real projected `updateTextBrick`-style command against both browser optimistic staging and authoritative execution, including Actor selected-row filtering, a partially exposed read-only Site, a complete exposed writable Brick, refusal of unavailable fields, and a rejected Actor grant. Exercise aggregate and service contracts, external continuations, reusable guards and the server extension if present.
4. Exercise release-specific evaluation and retained command history on clean test baselines; prove projected reads bind to the evaluating release, mutations retain exact versions, replay does not create new outbound work, and failed validation happens before storage changes. Check appropriate SystemSpec, session lock and administrative/diagram consumer seams. Report local and deployed-development evidence separately.
5. Run the relevant Zerospin Nx targets, existing core type checks and focused Workerd suites, then build and test affected consumer packages against the released exact pins. Confirm each consumer's reset inventory and post-cutover startup where its local/development environment is available. Report missing release, connected-runtime, or user-performed manual evidence rather than claiming completion. Do not run or list Explorer verification.

## Planned files

`+` creates; `~` modifies. Recheck actual call sites, plan numbers and release versions when execution starts.

```text
zerospin/
├── + wiki/plans/306-plan-contract-read-projections.md
├── ~ TODOS.md
├── ~ wiki/glossary.md
├── ~ wiki/architecture/                     # affected declaration and execution workflows
├── ~ fragment/content/                      # public authoring and API guidance
├── packages/core/
│   ├── ~ src/contracts/                    # declarations, read DB, evaluation and spec
│   ├── ~ src/guards/make/makeGuard.ts
│   ├── ~ src/declaration/                  # model and Actor capability validation
│   ├── ~ src/system/                       # SystemSpec compilation and validation
│   ├── ~ src/aggregateSession/             # optimistic execution integration
│   ├── ~ src/serviceSession/               # optimistic execution integration
│   └── ~ tests/                            # existing contract, model and staging tests
├── ~ packages/sdk/                         # public exports and installed guidance
├── ~ packages/system-worker/               # Actor-visible reads and existing Workerd tests
├── ~ packages/browser/                     # session lock or runtime integration as required
├── ~ packages/system-diagrams/             # portable fact consumers as required
├── ~ packages/studio/                      # portable fact consumers as required
└── ~ examples/                             # explicit contract and guard field lists

qrk.sh/                                     # and each inventoried consumer repository
├── ~ apps/bricks/                          # module-owned commands and shared guard reads
├── ~ apps/zerospin/                        # contracts, release declarations and tests
├── ~ apps/app/ and apps/web/               # session bindings only as required
└── ~ package manifests and lockfiles       # exact released Zerospin packages
```

## Remaining work

1. Coordinate integration with the separate command-continuation worktree, including its server-only extensions. That worktree was not modified here.
2. Complete the consumer cutover and verify connected development runtimes. The migrations are in isolated worktrees; four are based on unpublished local-main commits, so their publication requires a decision about those bases.
3. Finish the exact local and deployed-development storage inventory before any reset. No existing store or browser data has been reset. Isolated harness tests are not connected-runtime evidence.
4. Push the framework changes, open the requested PR ready for review, and wait for review of its current head according to Zerospin's instructions.

## Local release and consumer progress

The complete `45.0.2` package group was built and published to the existing
local registry for consumer verification. The earlier local `45.0.0` artifact
is incomplete; `45.0.1` corrected the read-DB helper type and `45.0.2` also
preserves query inference across model-version unions. These are local registry
artifacts, not a production release.

Focused Zerospin core, portable SystemSpec, Shopping and Tic-Tac-Toe tests passed
(93 tests), as did 19 Workerd tests, core type checks, and builds of the package
group, CLI, Studio and System Diagrams. Tests cover projected field access,
shape compatibility and inverse relation cardinality. Later changes were limited
to type inference and its tests; the focused core checks were repeated.

Explicit projection migrations are prepared in isolated QRK, Intervals, Red
Rope Parking, Mentor Mailbox, Stackshirts, Zerospin Cloud and Zerospin Email
worktrees. QRK's 31 backend tests, Intervals' four, Red Rope's seven, Mentor
Mailbox's four, Stackshirts' two and Zerospin Email's three passed; Cloud's
backend library built. QRK App and Storybook built, and Web built with Next's
webpack option after its default Turbopack worker could not bind a local port.
Mentor Mailbox's existing local Studio link remains unchanged. Four worktrees
have unpublished local-main bases; no unrelated commits have been pushed.
