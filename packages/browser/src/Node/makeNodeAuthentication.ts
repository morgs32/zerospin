import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';

import {
  NodeAuthenticationUnavailableError,
  NodeCredentialsTimeoutError,
} from './NodeErrors.ts';

export type INodeAuthenticationResult<Verified> =
  | { status: 'verified'; value: Verified }
  | { status: 'rejected' }
  | {
      status: 'unavailable';
      reason?: ReturnType<typeof NodeCredentialsTimeoutError.make>;
    }
  | { status: 'failed'; error: unknown };

/** Bound credential providers independently of local preparation and backend verification. */
export function makeNodeAuthentication<
  Admission,
  Verified extends { identity: unknown },
  Authenticated,
>(props: {
  identity: unknown;
  verify(
    admission: Admission,
    signal: AbortSignal,
  ): Promise<INodeAuthenticationResult<Verified>>;
  bind(value: Verified, getAdmission: () => Promise<Admission>): Authenticated;
  timeoutMs?: number;
}) {
  const { identity, verify, bind, timeoutMs = 5000 } = props;
  type IResult = INodeAuthenticationResult<Verified>;
  const providers = new Map<object, () => Promise<Admission>>();
  const pending = new Map<
    object,
    { round: AbortController; response: Promise<IResult> }
  >();
  let generation = 0;
  let suspended = false;
  let controller: AbortController | undefined;
  let attempt: Promise<Authenticated> | undefined;

  const runAttempt = async (
    round: AbortController,
    started: number,
  ): Promise<Authenticated> => {
    const expected = await sessionKey(identity);
    if (round.signal.aborted) {
      throw makeZerospinError('node-authentication-cancelled');
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let remaining = providers.size;
      let rejected = false;
      let failure: { error: unknown } | null = null;
      let credentialFailure:
        | ReturnType<typeof NodeCredentialsTimeoutError.make>
        | undefined;
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const cleanup = () => {
        for (const timer of timers) clearTimeout(timer);
        round.signal.removeEventListener('abort', cancel);
        round.abort();
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const cancel = () =>
        fail(makeZerospinError('node-authentication-cancelled'));
      round.signal.addEventListener('abort', cancel, { once: true });
      if (remaining === 0) {
        fail(NodeAuthenticationUnavailableError.make());
        return;
      }
      const unavailable = () => {
        remaining -= 1;
        if (remaining === 0) {
          fail(
            failure !== null
              ? failure.error
              : rejected
                ? makeZerospinError('node-authentication-rejected')
                : (credentialFailure ??
                  NodeAuthenticationUnavailableError.make()),
          );
        }
      };
      for (const [attachment, getAdmission] of providers) {
        const retained = pending.get(attachment);
        let response =
          retained?.round === round
            ? retained.response
            : retained === undefined
              ? undefined
              : Promise.resolve<IResult>({ status: 'unavailable' });
        if (response === undefined) {
          const completion = Promise.withResolvers<IResult>();
          response = completion.promise;
          let expired = false;
          const timer = setTimeout(() => {
            timers.delete(timer);
            expired = true;
            completion.resolve({
              status: 'unavailable',
              reason: NodeCredentialsTimeoutError.make({
                extra: { timeoutMs },
              }),
            });
          }, timeoutMs);
          timers.add(timer);
          const work = Promise.resolve()
            .then(getAdmission)
            .then<IResult>(admission => {
              clearTimeout(timer);
              timers.delete(timer);
              return expired || round.signal.aborted
                ? { status: 'unavailable' }
                : verify(admission, round.signal);
            })
            .catch((error): IResult => ({ status: 'failed', error }));
          const entry = { round, response };
          pending.set(attachment, entry);
          void work.then(result => {
            clearTimeout(timer);
            timers.delete(timer);
            completion.resolve(result);
            if (pending.get(attachment) === entry) pending.delete(attachment);
          });
        }
        void response
          .then(async result => {
            if (settled || started !== generation) return;
            if (!providers.has(attachment)) {
              unavailable();
              return;
            }
            if (result.status === 'verified') {
              const matches =
                (await sessionKey(result.value.identity)) === expected;
              if (settled || started !== generation || round.signal.aborted) {
                return;
              }
              if (!providers.has(attachment)) {
                unavailable();
                return;
              }
              if (matches) {
                const authenticated = bind(result.value, getAdmission);
                settled = true;
                cleanup();
                resolve(authenticated);
                return;
              }
              rejected = true;
            } else if (result.status === 'rejected') {
              rejected = true;
            } else if (result.status === 'failed') {
              failure ??= { error: result.error };
            } else if (result.status === 'unavailable') {
              credentialFailure ??= result.reason;
            }
            unavailable();
          })
          .catch(error => {
            if (!settled) {
              failure ??= { error };
              unavailable();
            }
          });
      }
    });
  };

  return {
    register(attachment: object, getAdmission: () => Promise<Admission>) {
      providers.set(attachment, getAdmission);
      return () => {
        providers.delete(attachment);
      };
    },
    authenticate(): Promise<Authenticated> {
      if (suspended) {
        return Promise.reject(makeZerospinError('node-signed-out'));
      }
      if (attempt !== undefined) return attempt;
      const round = new AbortController();
      controller = round;
      const current = runAttempt(round, generation);
      attempt = current;
      void current
        .finally(() => {
          if (attempt === current) {
            attempt = undefined;
            controller = undefined;
          }
        })
        .catch(() => undefined);
      return current;
    },
    clear() {
      suspended = true;
      generation += 1;
      controller?.abort();
      attempt = undefined;
    },
    async resume(resumedIdentity: unknown) {
      const started = generation;
      if (
        (await sessionKey(resumedIdentity)) !== (await sessionKey(identity))
      ) {
        throw makeZerospinError('node-authentication-identity-mismatch');
      }
      if (started !== generation) {
        throw makeZerospinError('node-authentication-cancelled');
      }
      suspended = false;
    },
  };
}
