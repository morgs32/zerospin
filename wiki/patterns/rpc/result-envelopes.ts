import { makeZerospinError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import { Effect } from 'effect';

/**
 * Named outbox subscribers in both runtimes return IRpcEnvelope<Receipt, IZerospinErrorJson>.
 * Browser receipts contain concrete retained phase records; server receipts retain
 * void or admission data as required by the source acknowledgement.
 * Other browser worker RPC without telemetry returns direct domain commands, arrays, or values.
 * A rejected Promise carries existing public error fields, preserving code/message/status/extra
 * and any declared public business scope. The boundary excludes diagnostic stack and cause;
 * the receiving browser restores the public Zerospin Error through restoreRpcError.
 * Never manufacture an id-only receipt where a retained staged/final command is available.
 *
 * Server RPC captures complete local telemetry in { result, telemetry }; configured Worker
 * boundaries export only their own records, while readRpcEnvelope imports remote records.
 * External APIs return { result, link }; a valid caller context establishes the causal link
 * independently of optional hosted export. Diagnostic delivery leaves domain outcomes intact.
 * A backendTrace reference names actual OTLP IDs without promising indexing. Domain admission controls
 * on browser sockets stay explicit; aggregate controls retain the optional telemetry link.
 * Direct final delivery and replay arrays do not need a result or command wrapper.
 *
 * Results in telemetry boundaries contain success values or encoded public failures.
 * Persisted business failures keep their original codec version and bytes independently
 * of adapted disclosure. encodeRpcOutcome serializes Effect outcomes without transmitting
 * runtime Error prototypes. A rejected Promise remains distinct from a resolved Failure.
 *
 * @bad Put stack text or private diagnostic cause into a public failure.
 * @bad Replace a valid domain outcome with a telemetry delivery failure.
 * @bad Treat a rejected Promise as though it were a resolved Failure.
 * @bad Add result/command wrappers to other nontelemetry browser worker operations.
 */
export const refused = Effect.fail(
  makeZerospinError({ code: 'access-denied', message: 'Access denied' }),
).pipe(Effect.withSpan('refused'), makeRpcEnvelope);
