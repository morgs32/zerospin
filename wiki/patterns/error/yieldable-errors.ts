import { Effect, type Cause } from 'effect';

/**
 * Yield a locally constructed business error or API Effect directly when the
 * value has no other use. Serialize runtime errors at result/API boundaries;
 * received JSON failures are data, not yieldable Error instances.
 *
 * ContractError belongs to contract guards/programs evaluated against invocation
 * state. Both receive model-scoped, read-only database access. Programs return
 * Channels with operation output and result completion; evaluateContract collects
 * and validates them before execution applies them. Authoritative reads occur inside
 * the command transaction before collected operations are applied. See
 * [Contract program output and results](../contracts/contract-program-emission-and-result.ts)
 * for the execution rules.
 * ActorError belongs to service actor guards. Aggregate actors declare no command
 * guards; their command policies belong to aggregateRelease.guards.
 * AggregateError belongs to aggregate guards
 * inside the authoritative AVR mutation transaction, never predictive checks.
 *
 * Declare every guard as a named Effect.fn, including callbacks that only
 * delegate to shared checks. Give shared guard functions their own Effect.fn
 * names as well.
 * Use makeGuard({ models, payload, identity, program }) for reusable
 * database checks. Payload and identity are Effect schemas; program is a
 * named Effect.fn with inferred { db, payload, identity }. Invocation
 * accepts decoded inputs without decoding again. Each owner callback supplies
 * its db as db and retains responsibility for the allowed failure scope.
 *
 * Use direct callbacks: contract.guard, serviceActor.guards[commandName], and
 * aggregate.guards[actorName][commandName]. Ownership determines scope; do not
 * add descriptor arrays or replace inherited checks. Infer business JSON types
 * from their codecs instead of adding a separate scoped-JSON alias.
 *
 * The proposed guard interfaces follow the agreed spec 005 proposal;
 * that guard migration is not implemented.
 * The declarations below model the intended interfaces.
 *
 * @bad Bind an error or API Effect to a temporary used only by the next yield.
 * @bad Wrap a yieldable error in Effect.fail solely to yield it in a generator.
 * @bad Yield a received JSON error directly or assume its prototype survived RPC.
 */
export const checkOwner = Effect.fn('checkOwner')(function* (
  accountId: string,
) {
  yield* AccountNotOwned.make({ extra: { accountId } });
});

export const withdraw = Effect.fn(function* (
  accountId: string,
  amount: number,
) {
  yield* api.withdraw({ accountId, amount });
});

declare const AccountNotOwned: {
  make(props: { extra: { accountId: string } }): Cause.YieldableError & {
    readonly code: 'account-not-owned';
    readonly scope: 'contract';
    readonly extra: { accountId: string };
  };
};

declare const api: {
  withdraw(props: { accountId: string; amount: number }): Effect.Effect<
    void,
    Readonly<{
      _tag: 'ZerospinError';
      code: string;
      message: string;
      status: number | null;
      extra: null;
    }>
  >;
};
