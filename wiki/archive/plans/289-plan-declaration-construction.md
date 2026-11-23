# Plan 289: Declaration construction and portable compilation

Status: Complete

## Approved behavior

Runtime declarations retain native codecs and callbacks. Session locks contain
scoped names, versions, and selected model/contract identities. Constructors do
not freeze declarations or compile portable specs. `makeSystem` validates nested
declaration relationships once. `makeSystemSpec` generates JSON Schemas and
portable metadata from the composed System. Transport and storage receivers
continue to decode untrusted data with their own native codecs.

## Implementation

1. Remove eager `.spec` fields and declaration freezing from Models, Contracts,
   Actors, Agents, owners, Shapes, and query metadata.
2. Resolve lock members by names and versions. Use the owning native session
   definition for Node codecs and resource tables.
3. Replace query model-spec transport with model identity and selected column
   names, preserving the existing read context.
4. Move nested relationship validation into `makeSystem`. Generate portable
   metadata only through `makeSystemSpec`, without repeatedly decoding generated
   trusted trees.
5. Update existing tests and affected developer documentation. Run focused
   library, type, lint and behavioral checks. Do not verify Explorer, deploy,
   reset storage, or publish packages.

```ts
// 1. Compose native declarations and validate their relationships once.
const system = makeSystem({ name: 'example', aggregates: {} });
// 2. Generate JSON Schema documents when a portable spec is requested.
const spec = makeSystemSpec({ system });
```

## Outcome and verification

1. Removed eager portable `.spec` fields and declaration freezing. Native codecs
   and callbacks remain on runtime declarations; portable projection is reached
   through `makeSystemSpec`.
2. Session locks contain names, versions, and selections. Node SQL tables and
   value validation use the selected native session declaration. Read queries
   carry model identities and visible column names, preserving their context.
3. Nested Actor, Agent, and owner relationships are validated from `makeSystem`.
   Generated metadata is no longer repeatedly decoded or frozen, including while
   computing its hash. Untrusted receiving boundaries retain validation.
4. The affected library graph passed (five selected projects and seven dependency
   tasks). Native callers passed a direct TypeScript check; the current Nx
   inventory does not expose the Native package as a project.
5. The Node test project passed all 116 tests in 23 files and compiled the complete
   test program. Five selected Workers files passed in the initial six-file run;
   the remaining lifecycle file passed all 14 tests after its invalid-lock
   fixture was corrected to request an unsupported contract version. These runs
   cover 41 unique Workers tests across the six files; this is not a clean full
   Workers-suite rerun.
6. Scoped lint passed with existing unrelated warnings. Formatting passed for all
   102 implementation files checked; `git diff --check` passed. Existing tests
   prove deferred JSON projection, native validation, exact lock selection,
   resource bytes/dates, query context, lineage, and metadata acceptance.

No package publication, consumer adoption, deployment, storage reset, or backup
creation occurred. Headless checks do not establish live browser or Native host
behavior. Unrelated local work is preserved.

## Remaining work

None.
