# React command execution interface usability

**Superseded exploration — 2026-10-27:** Completed
[Plan 271](../archive/plans/271-plan-remove-connected-session-command-execution.md)
removed connected-browser `executeCommand`; [Plan 270](../archive/plans/270-plan-contract-release-names-and-command-kinds.md)
is also complete. The interface comparisons and open questions below are
historical, not requirements to add pending fields, execution gates or private
outcome APIs. **Remaining work: none.**

Research discussion, 2026-10-26. No implementation, plan changes, application
verification or storage changes. Question: which command interface is easiest
for junior React engineers, considering the unresolved execution and local-view
behavior in the [Plan 270 handoff](../archive/handoffs/270-handoff-contract-release-names-and-command-kinds.md#open-decisions)?

## Finding and evidence limits

**Design inference:** the strongest default is one asynchronous command method
with observable state owned by the session. Separate admission/observation calls
or an execution handle impose additional coordination on every caller. However,
one method is not sufficient: its completion must have a precise relationship to
the local view and the session's command availability.

This is an inference from documented React patterns and the repository's
requirements, not a measured preference among junior React engineers. The primary
API-learning field study consulted surveyed/interviewed more than 440
professional developers. It identified documentation intent, examples and
scenario matching among important learning factors; it did not compare these
three interfaces or isolate junior React engineers. Fewer public methods alone
does not establish better usability. Source: [Robillard and DeLine, A field study
of API learning obstacles](https://www.microsoft.com/en-us/research/publication/field-study-api-learning-obstacles/).

## What familiar React interfaces teach

1. React's `useActionState` returns result state, an action dispatcher and pending
   state. It supports async Actions and queues invocations with the preceding
   state. This gives developers a documented pattern of initiating one action
   and rendering its result and progress. It does not establish session-wide
   ordering across independent Actions. Source: [React useActionState](https://react.dev/reference/react/useActionState).
2. React's `useTransition` keeps `isPending` true through awaited Actions and
   presentation of the final React state. Its documentation also explicitly
   warns that raw async Transitions do not guarantee request ordering. Neither
   behavior proves that an external Zerospin session view has been installed;
   that must be part of the awaited operation or independently observed.
   Source: [React useTransition](https://react.dev/reference/react/useTransition).
3. React's `useOptimistic` documents temporary optimistic state while an Action
   runs, followed by convergence with the actual value; a thrown Action returns
   rendering to the supplied value. It establishes a familiar relationship
   between pending work and the state ultimately displayed, rather than a
   separate "request finished, data still old" requirement left unexplained to
   callers. Source: [React useOptimistic](https://react.dev/reference/react/useOptimistic).
4. TanStack Query exposes one mutation trigger with observable pending, error
   and success state, plus `mutateAsync` for Promise composition. Its success
   semantics follow the mutation Promise: it cannot infer that a resolved
   Zerospin `outcome.result._tag === 'Failure'` is a business rejection. An
   unadapted wrapper would report mutation success for that resolved outcome.
   Source: [TanStack Query mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations).
5. TanStack explicitly shows awaiting query invalidation in `onSuccess` so
   `isPending` lasts until related data is updated. It therefore supplies a
   concrete first-party precedent for a mutation lifecycle that includes local
   reconciliation after the remote mutation. It does not prescribe waiting for
   every downstream projection or external action. Source: [Invalidations from
   mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations).

These sources support a familiar shape: invoke one action, render authoritative
pending/availability, consume one result. They do not justify copying a generic
mutation library's interpretation of error, offline behavior or cancellation.

## The handoff changes the important question

The existing research distinguishes reading a private canonical outcome from
installing resource rows, per-command final evidence and the view checkpoint.
It also records that cancellation ends the caller's wait without retracting
retained work. Reuse its source-grounded findings rather than treating this
research as new runtime evidence. Source: [existing research, Current evidence
4–5](session-command-availability-and-canonical-execution.md#current-evidence).

The handoff leaves single-flight execution, staging exclusion scope and public
field names open. Its recommendation to resume staging only after corresponding
final evidence and the local view are installed applies to both canonical
Success and Failure, but is explicitly unapproved. Known-offline entry must be
unavailable per the recorded user requirement. Sources: [handoff open
decisions](../archive/handoffs/270-handoff-contract-release-names-and-command-kinds.md#open-decisions),
[existing proposed direction](session-command-availability-and-canonical-execution.md#proposed-direction-not-an-agreed-implementation).

**Predicted caller mistake:** a developer writes `finally { setPending(false) }`
around `executeCommand`, then enables staging while the corresponding local view
is still old. The same mistake occurs when an aborted waiter clears local
pending state even though the admitted command still prevents safe staging.
These are design predictions from the recorded lifecycle, not observed usability
test results.

## Three interface shapes

**One Promise plus session state.** This minimizes ordinary caller coordination.
The session retains command input and derives availability; React consumes that
state. It should not maintain another authoritative busy flag around a Promise.
This is the recommended default shape, independently of the completion decision
below. This recommendation is an inference from the preceding sources.

**Separate admission and observation.** `await admitCommand(input)` followed by
`await awaitCommandOutcome(id)` has value when work is deliberately submitted on
one screen and observed on another, or observation must never submit work. For
an ordinary button, it exposes an extra ordering requirement, intermediate
identity and partial-failure case. Preserve it when those use cases exist;
requiring every junior caller to coordinate it is unnecessary. This is design
analysis, not an empirical preference claim.

**Execution handle.** Returning an object containing identity, an outcome
observer and a store helps shared progress UI and independent observation
lifetimes. For one button awaiting a result, it adds another object and lifecycle
to learn. Use it only when the extra observation capability earns its interface.
No first-party source reviewed establishes that a handle is generally preferred
by junior React engineers.

## The completion decision must remain explicit

There are two coherent Promise contracts:

1. **Canonical outcome only.** `executeCommand` returns the retained outcome as
   soon as it is available. Session-derived `canStageCommand` can remain false
   until local installation. This keeps execution evidence precise and returns
   useful business information promptly. It requires teaching callers that
   Promise settlement is not permission to stage or a guarantee that immediate
   local queries include the change. UI availability must come from the session.
2. **Canonical outcome plus this session's installed view.** The browser-facing
   method waits for both before returning the same canonical outcome. This best
   matches the simple caller expectation that the mutation has finished and its
   local data is ready for the next action. TanStack's awaited reconciliation
   supplies precedent, not proof. It is a new behavior requiring agreement. It
   can keep waiting after canonical finalization if delivery or projection fails,
   and must specify what interruption means without recasting a known canonical
   Success as a business Failure. Limit the guarantee to the calling session's
   corresponding installed view; do not promise downstream external completion.

The second contract is the stronger ergonomic candidate **if coherent local
state before continuation is the intended default requirement**. The first is
coherent when early canonical outcome is important. Do not silently choose the
second merely by changing a name. A private outcome observer can remain useful
in either design. These are proposals; the handoff approves neither.

## Illustrative React call site

The names below are proposed, not current exported APIs. The attempt stores one
command ID and immutable input before the first call. The session owns retained
work; the component owns only presentation of the observed outcome/error.

```tsx
const canExecuteCommand = Orders.useSession(s => s.canExecuteCommand);
const canStageCommand = Orders.useSession(s => s.canStageCommand);
const [message, setMessage] = useState<string | null>(null);

async function placeOrder() {
  try {
    const outcome = await session.executeCommand(attempt.command);
    setMessage(
      outcome.result._tag === 'Success'
        ? 'Order placed.'
        : outcome.result.failure.message,
    );
  } catch (error) {
    showExecutionError(error);
  }
}

return (
  <>
    <button disabled={!canExecuteCommand} onClick={placeOrder}>
      Place order
    </button>
    <button disabled={!canStageCommand} onClick={addAnotherItem}>
      Add item
    </button>
    {message && <p role="status">{message}</p>}
  </>
);
```

This deliberately does not turn Promise `finally` into session release evidence.
The methods must enforce the same availability rules because disabled controls
alone cannot establish admission or concurrency correctness. An ambiguous failure
retries the same retained identity/input; changing the business input starts a
new command. Cancellation must not clear retained work. These recommendations
follow the handoff's retained-work and availability distinctions, not approval of
a singular pending field or single-flight policy.
