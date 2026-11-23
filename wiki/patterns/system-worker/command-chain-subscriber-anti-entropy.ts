/**
 * Subscriber-owned catch-up commits bounded pages before live enrollment.
 *
 * AggregateChain and ServiceChain send complete finalized admitted input to their
 * VersionRepos. Source-bound subscribers evaluate those rows through the same
 * receive Effect used by pull catch-up. AggregateVersionChain sends complete evaluated
 * commands and ServiceVersionChain sends complete service execution packets to
 * actor projections, which replay retained operations without authored programs.
 * ActorVAR projects only AVC outputs.
 *
 * Each `${queueName}Subscriber(sourceKey)` capability binds one source queue,
 * enrollment key, and durable receiver cursor. `catchup(index?)` requests
 * `queue.getPage({ afterIndex, maxIndex? })`. Its first response supplies
 * the fixed destination when the caller omitted one; later `lastIndex` values
 * do not move that destination. Pulled and pushed `IFanoutDelivery` envelopes
 * use the same receive operation and commit local state/output before success.
 * Source acknowledgements advance monotonically only to the last committed
 * delivered row or a validated committed receiver checkpoint. The receiver may
 * be ahead after a lost acknowledgement; source-confirmed progress stays distinct.
 * Delivery failure preserves backlog and excludes only this drain's recipient.
 * Later durable alarms retry without persisted suspension or manual resume.
 *
 * `subscriber.subscribe(index?)` completes catch-up, rereads durable progress,
 * then enrolls through `queue.subscribe`. Retained history covers rows appended
 * between catch-up and enrollment. No receiver permit spans page requests or
 * source enrollment. Empty history at zero succeeds; missing history below the
 * destination and non-advancing receipts fail rather than recurse indefinitely.
 *
 * VersionRepo activation awaits .catchup() through the first available finalized
 * prefix and keeps source-authored enrollment. A cursor already above that prefix
 * succeeds unchanged; .subscribe() would incorrectly reject that valid case.
 * Dynamic projection activation uses .subscribe(). Ordinary snapshot paths read
 * current committed projection state and do not force another source-tip replay.
 * See `i-fanout-repo.ts` for the factory and accessor contracts.
 *
 * @bad Treat the envelope's lastIndex as acknowledgement of its whole history.
 * @bad Advance the subscriber frontier before local state and output commit.
 * @bad Re-execute authored code in a final-history actor projection.
 * @bad Keep a second transport paging loop in a Repo.
 * @bad Call a public VersionRepo.catchupMaterialization or flush progress RPC.
 * @bad Ask a Chain to execute pending originals while opening a VersionRepo.
 */
export {};
