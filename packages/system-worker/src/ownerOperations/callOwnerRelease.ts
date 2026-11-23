import {
  getOwnerReleaseBindingName,
  RUN_OWNER_OPERATION_PATH,
  type IOwnerRelease,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { deserialize, serialize } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Call authored code on the release that owns it, using the local runner when colocated. */
export const callOwnerRelease = Effect.fn('callOwnerRelease')(function* <
  A,
  E,
  R,
>(props: {
  env: object;
  release: IOwnerRelease;
  request: unknown;
  executionBuildId?: string;
  local: Effect.Effect<A, E, R>;
  response: Schema.Codec<A, unknown>;
  path?: string;
  timeout?: number;
}) {
  const { env, release, request, local, response } = props;
  const name = getOwnerReleaseBindingName(release);
  const hosted: unknown =
    'serviceName' in release
      ? Reflect.get(env, 'ZEROSPIN_HOSTED_SERVICE_DISPATCH')
      : undefined;
  const binding: unknown = hosted ?? Reflect.get(env, name);
  const localRepoBinding =
    'aggregateName' in release
      ? 'AGGREGATE_VERSION_REPO'
      : 'SERVICE_VERSION_REPO';
  if (
    binding === undefined &&
    props.executionBuildId === undefined &&
    Reflect.get(env, localRepoBinding) !== undefined
  ) {
    return yield* local;
  }
  if (
    typeof binding !== 'object' ||
    binding === null ||
    !('fetch' in binding) ||
    typeof binding.fetch !== 'function'
  ) {
    return yield* makeZerospinError('owner-operation-binding-unavailable');
  }
  const fetch = binding.fetch.bind(binding);
  const result = yield* Effect.tryPromise({
    try: async signal => {
      const headers = new Headers();
      if (props.executionBuildId !== undefined)
        headers.set('X-Zerospin-Execution-Build', props.executionBuildId);
      if (hosted && 'serviceName' in release) {
        headers.set('X-Zerospin-Service-Name', release.serviceName);
        headers.set(
          'X-Zerospin-Service-Version',
          String(release.serviceVersion),
        );
      }
      const result: Response = await fetch(
        new URL(
          props.path ?? RUN_OWNER_OPERATION_PATH,
          'https://owner-release.internal',
        ),
        {
          method: 'POST',
          body: serialize(request),
          signal,
          headers,
        },
      );
      if (!result.ok)
        throw new Error('Owner operation returned ' + result.status);
      return deserialize(await result.text());
    },
    catch: cause =>
      makeZerospinError({
        code: 'owner-operation-call-failed',
        message: String(cause),
      }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: props.timeout ?? '30 seconds',
      orElse: () =>
        Effect.fail(makeZerospinError('owner-operation-call-timeout')),
    }),
  );
  return yield* Schema.decodeUnknownEffect(response)(result, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'owner-operation-response-invalid',
      prefix: 'Invalid owner operation response',
    }),
  );
});
