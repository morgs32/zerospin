# MachineActor TODOs

The current Actor contract covers explicit construction and startup with
pre-start Handle observation, current activation ownership, action and
`onActivation` transitions, stale Handles and stale automatic completions,
serialized independent callers, optional save-before-publication persistence,
exact-Cause terminal defects, and scoped shutdown.

- Decide whether unexpected action-program defects should terminate the Actor
  or remain local to the action invocation. Typed action failures remain
  nonterminal.
- Add action deduplication, an outbox, or a shared transaction boundary only
  when a concrete caller requires guarantees beyond atomic State-row saving.
