/**
 * Declare RPC schemas in *Api through rpcMethod; let the keyed Repo validate authored declarations,
 * claims, and resource access against its own release and database.
 *
 * @bad Repeat RPC request-shape decoding inside a Repo after the API decoded it.
 * @bad Treat API shape validation as proof that a lock matches owner declarations.
 * @bad Echo owner and admitted actor fields from authorization just to compare them
 * before constructing the session capability from already-retained context.
 * @bad Route same-isolate work through `ctx.exports` instead of imported Effects.
 */
// The generated boundary owns decoding and outcome construction; the keyed Repo
// still owns authored-lock, claims, and resource authorization.
export { openSession } from '../../../packages/system-worker/src/AggregateAccessApi/openSession/openSession.js';
