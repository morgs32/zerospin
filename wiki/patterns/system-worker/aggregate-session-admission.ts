/**
 * Actor version-chain sockets validate their authenticated connection,
 * definition lock, exact ordinary contract declaration, and single pending submission.
 * They submit the original command directly to AggregateChain.admitAggregateCommands
 * with the server-owned systemName. Verify the singleton returned command retains
 * the submitted immutable input and provenance before disclosing its aggregate index.
 * Submitted Actor commands carry flat actorName/actorVersion/claims and a required
 * nodeId/sessionName/pushIndex tuple; stable session identity remains an object.
 * Ordinary ingress excludes Continuation commands. Only the exact pending-work
 * transaction stamps a claims-free child with its immediate originCommandId.
 * AC owns structural/declaration validation, atomic duplicate recovery, dense node
 * push indices, and aggregate order. Admission establishes retention, not execution.
 * AggregateVersionRepo runs aggregateRelease.guards and the contract guard/program
 * inside the authoritative business savepoint. Actor authentication and session
 * authorization are independent admission policies; service actor guards remain.
 * Authentication, claims and canonical Actor identity checks do not depend on
 * diagnostic persistence. Optional telemetry preserves the domain result.
 * SystemRepo issues one-use tickets for Aggregate/Service Actors and Agents from
 * complete validated authority: exact owner release, full lock, actual claims or
 * Origin, Actor path and Node binding. Session and Service Actor identity come
 * from the full lock. Agent Node identity binds public observation and resume;
 * Agent sockets neither submit commands nor recover private outcomes.
 * The matching-family DELETE RETURNING spends a ticket before retained-row
 * decoding and forwarding; wrong-family requests retain it. Forwarding removes
 * the URL query and replaces caller internal headers with retained authority.
 * Ticket spend proves neither socket installation nor command admission.
 * Browser Actor sessions alone stage speculative work. Confirmed Actor projections
 * consume canonical operations and their private final outcomes without running programs.
 * Ordered final delivery or a checkpoint-bounded snapshot settles local optimism.
 *
 * @bad Treat an admission receipt as an authoritative resource delta.
 * @bad Copy browser optimism or a local staging refusal into server admission.
 * @bad Evaluate aggregate policies against a speculative projection.
 * @bad Resolve browser optimism before final output or published snapshot.
 */
export {};
