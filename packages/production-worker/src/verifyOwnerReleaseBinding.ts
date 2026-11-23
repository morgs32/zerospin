import {
  getOwnerReleaseBindingName,
  OwnerReleaseIdentitySchema,
  OwnerReleaseSchema,
  type IOwnerRelease,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { checkSecretApiKey } from '@zerospin/system-worker/GatewayApi/getSystemApi/checkSecretApiKey/checkSecretApiKey';
import {
  getPinnedOwnerRelease,
  listPinnedOwnerReleases,
} from '@zerospin/system-worker/workerConfiguration/workerConfiguration';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

const decodeRelease = Schema.decodeUnknownSync(OwnerReleaseSchema);
const decodeIdentity = Schema.decodeUnknownSync(OwnerReleaseIdentitySchema);

/** Prove an authenticated deployment can call the expected owner through this version's binding. */
export async function verifyOwnerReleaseBinding(
  request: Request,
): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return new Response(null, { status: 405 });
  }
  const apiKey = request.headers
    .get('Authorization')
    ?.match(/^Bearer (.+)$/)?.[1];
  if (apiKey === undefined) return new Response(null, { status: 401 });

  const authorized = await Effect.runPromise(
    checkSecretApiKey({
      apiKey,
      policy: {
        environment: env.ZEROSPIN_ENVIRONMENT,
        secretKey: env.ZEROSPIN_SECRET_KEY,
        publishableKey: env.ZEROSPIN_PUBLISHABLE_KEY,
      },
    }).pipe(Effect.exit),
  );
  if (authorized._tag === 'Failure') {
    return new Response(null, { status: 401 });
  }

  if (request.method === 'GET') return Response.json(listPinnedOwnerReleases());

  let release: IOwnerRelease;
  try {
    release = decodeRelease(await request.json(), {
      onExcessProperty: 'error',
    });
  } catch {
    return Response.json(
      { code: 'owner-release-probe-invalid' },
      { status: 400 },
    );
  }
  const expected = getPinnedOwnerRelease(release);
  if (expected === undefined) {
    return Response.json(
      { code: 'owner-release-binding-unregistered' },
      { status: 404 },
    );
  }
  const bindingName = getOwnerReleaseBindingName(release);
  const binding: unknown = Object.hasOwn(env, bindingName)
    ? Reflect.get(env, bindingName)
    : undefined;
  if (typeof binding !== 'object' || binding === null) {
    return Response.json(
      { code: 'owner-release-binding-missing' },
      { status: 503 },
    );
  }

  try {
    const observed = await Effect.runPromise(
      Effect.tryPromise(async () =>
        Reflect.apply(
          Reflect.get(binding, 'getOwnerReleaseIdentity'),
          binding,
          [],
        ),
      ).pipe(Effect.timeout('3 seconds')),
    );
    const identity = decodeIdentity(observed, { onExcessProperty: 'error' });
    if (
      identity.systemId !== env.ZEROSPIN_SYSTEM_ID ||
      getOwnerReleaseBindingName(identity.release) !== bindingName ||
      identity.versionId !== expected.versionId ||
      identity.specHash !== expected.specHash
    ) {
      return Response.json(
        { code: 'owner-release-binding-mismatch' },
        { status: 502 },
      );
    }
    return Response.json(identity);
  } catch {
    return Response.json(
      { code: 'owner-release-binding-probe-failed' },
      { status: 502 },
    );
  }
}
