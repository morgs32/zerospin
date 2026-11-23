# Strengthening local-state UI guidance

**Date:** 2026-11-02

**Status:** Research and documentation recommendations only. This note does not implement documentation, skill, API, consumer, or test changes.

**Question:** How should Fragment documentation and published Zerospin skills help developers avoid unnecessary loading states, blank redirects, and command-completion barriers without losing real failure recovery?

**Evidence:** Historical working-tree source inspected on 2026-11-02; base commit `db64d210ba2ba102024cb26656d4acfd8216d86a`. External references are official React, TanStack Router, Testing Library, and Storybook documentation. Recommendations below are design inferences from those sources, not measured claims about documentation effectiveness. Recheck the linked live guides before implementing a recommendation; this note records the gaps observed on that date.

## Recommendation

Strengthen the existing guides with three worked scenarios: rendering a known destination while its URL changes, composing independent session/readiness boundaries, and clearing a composer after staging while preserving later failure recovery. Put a short decision rule in the relevant skill entrypoints so those scenarios are consulted during UI design, not only during session construction. The inspected skills already contained the underlying principles; examples and the conditions under which each principle applies need to become explicit. [React skill][Z1], [submission skill][Z2], [existing React guide][D1].

The repeated question should be: **Which unresolved fact prevents this content from rendering?** Require a named fact, its owner, and the evidence that resolves it. A router effect, an unused session's startup, or an acknowledgement unrelated to the visible screen is not by itself a missing product fact. This is a proposed review rule, supported by the existing separation between providers, readiness boundaries, local reads, and command execution. [SessionReady][Z3], [local query guide][D2], [staging implementation][Z4].

## What is already covered, and where it falls short

1. The React guide and reference already keep public content outside `SessionReady`; the React skill says to gate database readers and command controls. Their principal example has one session and one board, so it does not demonstrate independent account, roster, chat, or guest readiness. [React guide][D1], [React reference][D3], [React skill][Z1].
2. The submission skill already instructs callers not to delay navigation, cleanup, or account changes for persistence, delivery, or canonical execution. The command guide explains synchronous staging and later domain outcomes, but its opening example only handles refusal; it does not show immediate form cleanup together with later input recovery. [Submission skill][Z2], [command guide][D4].
3. The query guide already distinguishes an initialized empty selection from failed initialization and warns that missing local rows may be outside the actor's selection. Extend this distinction; do not teach that every absent row is either loading or a terminal error. [Query guide][D2].
4. One concrete API example needs repair before expansion: the command guide refers to `staged.success.staging.result`, while the inspected `ISessionSubmission` type exposes `stagingOutcome.result`. This is source/document drift, not a proposed new API. [Command guide][D4], [submission type][Z5].

The earlier [async UI ownership audit][H1] supplies historical examples. Its old API versions and application findings must not be treated as current implementation facts. The [React command-interface exploration][H2] explicitly marks its earlier async-interface proposals superseded.

## 1. Teach rendering and URL normalization separately

React recommends deriving values needed for rendering directly from existing props/state rather than computing them through an Effect that triggers another render. That supports classifying a destination during render; synchronizing the browser URL remains a separate external effect. [React: unnecessary Effects][R1].

Add a paired example to the React guide:

```tsx
// Bad: the destination is known, but the effect is treated as pending work.
if (status === 'waitlisted') return <Loading />;

// Good: render the route-independent body from the ready local result.
if (status === 'waitlisted') return <WaitlistContent />;
```

The complete published example should additionally show the host router's URL replacement, retain needed search/hash values, skip the canonical destination, and yield to a newer navigation. It must not embed a path-bound authentication widget at a noncanonical URL. These are recommended application composition rules; the router supplies navigation state, not a Zerospin rendering primitive. TanStack distinguishes requested `location` from settled `resolvedLocation`, so an outgoing screen cannot assume its rendered URL is still the latest navigation intent. [RouterState][T1].

TanStack's `pendingMs` controls when router pending UI appears; `pendingMinMs` can keep it displayed after the underlying work finishes. Treat those as presentation settings. Suppressing takeover for an already-rendered destination can be appropriate, but a blanket infinite threshold neither makes a session ready nor supplies missing data or error handling. [TanStack pending UI][T2].

Authentication examples should use already-loaded provider/context identity for UI decisions where that information exists. TanStack explicitly supports passing React authentication state through router context. This does not justify removing server authentication or authorization needed for protected SSR content, APIs, or commands. [TanStack authenticated routes][T3], [Zerospin authorization handbook][D5].

Add one ordinary-empty example and one required-row example: an empty collection renders its empty state; a row guaranteed by completed authorization/initialization but absent from the ready view enters a genuine invariant failure. If a row is produced by later domain work, render that work's explicit state and failure/recovery path. Do not invent a generic infinite resolver. [Query guide][D2], [SessionReady error boundary][Z3].

## 2. Teach session ownership independently of visible panels

Expand the current single-session example into a small two-session example. The public frame and identity controls stay outside both gates; each ready boundary contains only readers of its exact session. Acquire independent sessions as siblings or above their respective boundaries. Nesting a provider is harmless; nesting acquisition beneath an unrelated readiness condition creates the unwanted dependency. The provider itself does not gate its children. [React guide][D1], [React reference][D3], [SessionReady][Z3].

The example should show genuine recovery withdrawing readers, not keeping a previous account's ready facade to preserve appearances. Managed hooks already hide a changed identity's prior capability during render and own disposal/replacement. A disabled `SessionReady` renders neither children nor fallback, so known signed-out and unresolved authentication branches must be handled outside that boundary. [Managed hook][Z6], [SessionReady][Z3].

React ties component state to tree position and removes it on unmount. Zerospin's managed owner likewise disposes its facade on unmount; the browser skill describes cleanup when the last client ends. Therefore the documentation must ask whether queued work must continue after a pane closes. If yes, place the existing managed owner at the required stable ancestor and gate only the pane's readers. Do not imply that a still-existing SharedWorker script guarantees continued delivery after its last live session client disappears. [React state lifetime][R2], [managed owner][Z7], [browser lifetime skill][Z8].

Also show a real server-renderable frame. React requires matching server/client hydration content; moving a previously client-only account header into that frame exposes random styling or other nondeterministic render values. The example should be deterministic, not hide mismatches. [React hydration][R3].

## 3. Teach immediate cleanup together with explicit failure recovery

Use a message composer as the worked example because it makes the distinction visible: local staging can release the next draft while server execution remains unresolved. Preserve synchronous local refusal and genuine upload prerequisites. Synchronous staging success is not proof of canonical execution or an external provider outcome. [Aggregate staging][Z4], [completion boundaries][Z9].

Illustrative application-owned steps after narrowing the actual staging result:

```ts
if (staged._tag === 'Failure') {
  setError(staged.failure.message);
  return; // Current draft is preserved.
}

// These are host responsibilities, not additional SDK methods.
retainSubmittedInput(payload, staged.success);
clearComposer();
```

The complete example should preserve exact submitted content separately from the next editable draft; correlate by the returned session coordinates; keep the required session owner alive; and show later refusal without overwriting newer input. This is a recommendation for products requiring recoverable rejected input, not a requirement that every form implement a queue. Payment/uniqueness/provider-confirmation views still depend on their actual domain evidence; unrelated controls need not share that wait. [Completion boundaries][Z9], [existing domain-state guidance][D4].

The inspected implementation suggests three recovery topics to teach:

1. **Decode retained payloads with the bound contract codec.** JSON primitive fields use `Schema.fromJsonString`, and portable codecs retain that encoding. Parsing only the outer payload does not decode a nested `parts` or `assign` field. Show the selected contract's codec and use the real encoder in examples that prepare retained-command evidence. [Primitive descriptor compiler][Z10], [shape codecs][Z11], [command encoder][Z12].
2. **The session journal is not a permanent failed-message inbox.** Checkpoint replacement deletes resolved aggregate command rows. Products promising recovery beyond those rows' lifetime need an explicit input-retention policy; disconnect or a missing row must not be presented as a definitive refusal. No automatic restaging after uncertain delivery. [Checkpoint installation][Z13], [completion boundaries][Z9].
3. **Retry must correspond to a recoverable condition.** Managed `retry` only replaces an errored generation. Aggregate transport retry refuses admission, authentication, checkpoint, and storage failures. Do not fabricate a terminal failure merely to activate Retry or promise that reconnect repairs authorization. Document genuine session Retry, account/permission recovery, and a deliberate new business attempt separately. [Managed retry][Z7], [AggregateNode retry policy][Z14].

React's external-store API reinforces using current subscribed snapshots with proper unsubscribe and stable snapshot values. It specifically warns that suspending from an external-store value can replace visible content with a fallback. This supports retaining Zerospin's existing subscription/readiness model instead of introducing an Effect-maintained copy of the same domain state. [React external stores][R4].

## 4. Make verification assert the forbidden intermediate state

The recommendation is to extend permitted existing stories/checks, not create a general test framework. Testing Library's `findBy` establishes eventual appearance; it cannot by itself prove that an earlier frame was correct. `waitFor` retries an assertion, so use it for actual visibility/animation conditions, not fixed sleeps. Storybook requires awaited interaction assertions and provides interaction-test results for observing their outcome. [Testing Library async queries][V1], [Storybook interactions][V2].

Use a small set of scenarios with explicit observable behavior:

1. Seed the resolved destination and hold canonical navigation with a controlled promise. Assert destination and public framing before releasing navigation, then verify the URL actually committed. Record DOM changes after the first expected render if a no-flash guarantee is required; do not discard blank samples.
2. Start a different navigation while identity/session acquisition is unresolved, then resolve it. The older normalizer must not win.
3. Hold session A while ready session B's content remains visible. Exercise failure/recovery as well as cold readiness.
4. Keep transport unresolved after staging. Assert immediate composer cleanup and a second deliberate send before execution confirmation. Return a later real refusal and verify the original submitted content survives without modifying the next draft.
5. Close the pane before delivery; verify the session owner remains active when required and releases after its work settles. Switch identity and verify old records and command controls disappear on the first new-account render.
6. Prepare command evidence using the SDK encoder and demonstrate that decoding recovers nested fields. An invented plain-object journal fixture would miss the encoding defect.

These are proposed tests inferred from the failure modes, not guarantees provided by Testing Library or Storybook. Mock session hooks exercise seeded local execution, not connected admission, transport, or canonical reconciliation. Keep that limitation visible and reserve a bounded connected check for the claims depending on real delivery. [Mock session implementation][Z15], [React mock guidance][D3].

## Suggested order

Start with one known-route example and one composer example in the existing
React and command guides. Then link those examples from the React and submission
skills, keeping packaged references local to the SDK. Expand query and failure
guidance only where those examples expose a missing explanation. Check examples
against current public declarations before publishing.

## Scope and limits

This note proposes documentation work; it does not certify runnable examples or
implement the recommendations.

No new framework abstraction, app-wide submission store, or universal prohibition on domain confirmation is proposed. Concrete owner lifetimes and rejected-input retention remain product requirements. The source observations describe the inspected revision; the recommended teaching structure has not been usability-tested.

[D1]: ../../docs/content/guides/react-and-nextjs.md
[D2]: ../../docs/content/guides/query-data.md
[D3]: ../../docs/content/reference/react.md
[D4]: ../../docs/content/guides/write-commands.md
[D5]: ../../docs/content/handbook/actors-and-authorization.md
[D6]: ../../docs/content/handbook/failures-and-recovery.md
[Z1]: ../../packages/react/skills/zerospin-react/SKILL.md
[Z2]: ../../packages/sdk/skills/zerospin-submit-commands/SKILL.md
[Z3]: ../../packages/react/src/SessionReady.tsx
[Z4]: ../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts
[Z5]: https://github.com/morgs32/zerospin/blob/db64d210ba2ba102024cb26656d4acfd8216d86a/packages/core/src/contracts/types.ts#L431-L444
[Z6]: ../../packages/react/src/managedSession/useManagedSession.ts
[Z7]: ../../packages/react/src/managedSession/makeManagedSession.ts
[Z8]: ../../packages/browser/skills/zerospin-browser-sessions/SKILL.md
[Z9]: ../../packages/sdk/skills/zerospin-submit-commands/references/completion-boundaries.md
[Z10]: https://github.com/morgs32/zerospin/blob/db64d210ba2ba102024cb26656d4acfd8216d86a/packages/shapes/src/compileDescriptor.ts
[Z11]: https://github.com/morgs32/zerospin/blob/db64d210ba2ba102024cb26656d4acfd8216d86a/packages/shapes/src/makeShapeCodecs.ts
[Z12]: ../../packages/core/src/contracts/encodePayload.ts
[Z13]: ../../packages/core/src/aggregateSession/installAggregateNodeView.ts
[Z14]: ../../packages/core/src/AggregateNode/AggregateNode.ts
[Z15]: ../../packages/browser/src/makeMockAggregateSession.ts
[H1]: async-ui-command-query-audit.md
[H2]: react-command-execution-interface-usability.md
[R1]: https://react.dev/learn/you-might-not-need-an-effect
[R2]: https://react.dev/learn/preserving-and-resetting-state
[R3]: https://react.dev/reference/react-dom/client/hydrateRoot
[R4]: https://react.dev/reference/react/useSyncExternalStore
[T1]: https://tanstack.com/router/latest/docs/api/router/RouterStateType
[T2]: https://tanstack.com/router/latest/docs/guide/data-loading#showing-a-pending-component
[T3]: https://tanstack.com/router/latest/docs/guide/authenticated-routes#authentication-using-react-contexthooks
[V1]: https://testing-library.com/docs/dom-testing-library/api-async/
[V2]: https://storybook.js.org/docs/writing-tests/interaction-testing
