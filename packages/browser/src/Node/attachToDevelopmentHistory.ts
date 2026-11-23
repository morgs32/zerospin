import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { isZerospinError } from '@zerospin/error';

type IResolution = { definition: { identity: unknown } } & (
  | { online: false }
  | {
      online: true;
      verified: { developmentHistory?: { id: string } | undefined };
    }
);

/** A clean can race registration or retire the Node beneath an attachment. Reauthenticate on progress. */
export async function attachToDevelopmentHistory<
  R extends IResolution,
  A,
>(props: {
  key: string;
  resolved: R;
  reauthenticate(): Promise<R>;
  attach(resolution: R): Promise<A>;
}): Promise<A> {
  let resolution = props.resolved;
  const retried = new Set<string>();
  for (;;) {
    try {
      return await props.attach(resolution);
    } catch (failure) {
      if (
        !isZerospinError(failure) ||
        (failure.code !== 'node-development-registration-stale' &&
          failure.code !== 'node-development-history-replaced')
      ) {
        throw failure;
      }
      const attempt = JSON.stringify([
        resolution.online && resolution.verified.developmentHistory?.id,
        failure.code,
      ]);
      if (retried.has(attempt)) throw failure;
      retried.add(attempt);
      resolution = await props.reauthenticate();
      if (
        !resolution.online ||
        !resolution.verified.developmentHistory ||
        (await sessionKey(resolution.definition.identity)) !== props.key
      ) {
        throw failure;
      }
    }
  }
}
