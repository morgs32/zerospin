import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { buildCommandContinuation } from '@zerospin/core/contracts/buildCommandContinuation';
import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import { ExternalOutcomeSchema } from '@zerospin/core/contracts/ExternalOutcomeSchema';
import { makeReleaseSpec } from '@zerospin/core/declaration/makeReleaseSpec';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import {
  OwnerReleaseSchema,
  RUN_OWNER_OPERATION_PATH,
  type IOwnerRelease,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystemConfig } from '@zerospin/core/system/types';
import { isZerospinError } from '@zerospin/error';
import {
  runExternalContinuation,
  runExternalRequest,
} from '@zerospin/system-worker/externalOperations/runExternalOperation';
import {
  OwnerExternalRequestSchema,
  OwnerOperationRequestSchema,
} from '@zerospin/system-worker/ownerOperations/ownerOperationSchema';
import { runWorkerInvocation } from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import { deserialize, serialize } from 'capnweb';
import { env } from 'cloudflare:workers';
import * as Cause from 'effect/Cause';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import type { IOwnerReleaseWorkerConfig } from './ownerReleaseRuntime.js';

const decodeRelease = Schema.decodeUnknownOption(OwnerReleaseSchema);
const decodeOwnerOperation = Schema.decodeUnknownSync(
  OwnerOperationRequestSchema,
);

export function readOwnerReleaseIdentity(
  config: IOwnerReleaseWorkerConfig,
  expectedRelease: IOwnerRelease,
): IOwnerReleaseIdentity | undefined {
  const { systemId, systemSpecHash } = config;
  const release = decodeRelease(Reflect.get(env, 'ZEROSPIN_OWNER_RELEASE'), {
    onExcessProperty: 'error',
  });
  const versionId = env.ZEROSPIN_VERSION_METADATA?.id;
  if (
    !systemId ||
    !/^[a-f0-9]{64}$/u.test(systemSpecHash) ||
    env.ZEROSPIN_SYSTEM_ID !== systemId ||
    release._tag === 'None' ||
    !versionId
  ) {
    return;
  }
  const actualRelease = release.value;
  const matches =
    'aggregateName' in expectedRelease
      ? 'aggregateName' in actualRelease &&
        actualRelease.aggregateName === expectedRelease.aggregateName &&
        actualRelease.aggregateVersion === expectedRelease.aggregateVersion
      : 'serviceName' in actualRelease &&
        actualRelease.serviceName === expectedRelease.serviceName &&
        actualRelease.serviceVersion === expectedRelease.serviceVersion;
  return matches
    ? { systemId, release: actualRelease, versionId, specHash: systemSpecHash }
    : undefined;
}

export function readOwnerReleaseDeclaration(
  identity: IOwnerReleaseIdentity,
  release: IAnyAggregateRelease | IAnyServiceRelease,
) {
  const deploymentId = Reflect.get(env, 'ZEROSPIN_DEPLOYMENT_ID');
  return {
    identity,
    releaseSpec: makeReleaseSpec(release),
    ...(typeof deploymentId === 'string' ? { deploymentId } : {}),
  };
}

export async function handleOwnerReleaseRequest(
  request: Request,
  identity: IOwnerReleaseIdentity | undefined,
  release: IAnyAggregateRelease | IAnyServiceRelease,
  runtime: ISystemConfig,
  prepareReplay: (request: Request, pathname: string) => Promise<Response>,
  builds?: ReadonlyMap<string, IAnyServiceRelease>,
): Promise<Response> {
  if (identity === undefined) {
    return Response.json(
      { code: 'owner-release-worker-identity-invalid' },
      { status: 503 },
    );
  }
  const { pathname } = new URL(request.url);
  if (request.method !== 'POST') return new Response(null, { status: 404 });
  if (
    builds !== undefined &&
    (pathname === RUN_OWNER_OPERATION_PATH ||
      pathname === RUN_OWNER_OPERATION_PATH + '/request')
  ) {
    const buildId = request.headers.get('X-Zerospin-Execution-Build');
    const build = buildId === null ? undefined : builds.get(buildId);
    if (build === undefined) {
      return Response.json(
        { code: 'service-execution-build-unavailable' },
        { status: 409 },
      );
    }
    release = build;
  }
  if (pathname === RUN_OWNER_OPERATION_PATH + '/request') {
    let input: typeof OwnerExternalRequestSchema.Type;
    try {
      input = Schema.decodeUnknownSync(OwnerExternalRequestSchema)(
        deserialize(await request.text()),
        { onExcessProperty: 'error' },
      );
    } catch {
      return Response.json(
        { code: 'owner-external-request-invalid' },
        { status: 400 },
      );
    }
    const result = await runtime.managedRuntime.runPromiseExit(
      runWorkerInvocation(runExternalRequest(release, input)),
      { signal: request.signal },
    );
    return Exit.isSuccess(result)
      ? new Response(
          serialize(Schema.encodeSync(ExternalOutcomeSchema)(result.value)),
        )
      : Response.json(
          { code: 'owner-external-request-failed' },
          { status: 422 },
        );
  }
  if (pathname !== RUN_OWNER_OPERATION_PATH) {
    return prepareReplay(request, pathname);
  }
  let input: ReturnType<typeof decodeOwnerOperation>;
  try {
    input = decodeOwnerOperation(deserialize(await request.text()), {
      onExcessProperty: 'error',
    });
  } catch {
    return Response.json(
      { code: 'owner-operation-request-invalid' },
      { status: 400 },
    );
  }
  const result = await runtime.managedRuntime.runPromiseExit(
    runWorkerInvocation(
      input._tag === 'ExternalContinuation'
        ? runExternalContinuation(release, input)
        : provideReleaseLayer(
            release,
            buildCommandContinuation(release, input),
          ),
    ),
    { signal: request.signal },
  );
  return Exit.isSuccess(result)
    ? new Response(serialize(result.value))
    : Response.json(
        { code: 'owner-operation-execution-failed' },
        { status: 422 },
      );
}

export function encodeReplayPreparation(
  result: Exit.Exit<unknown, unknown>,
  failureCode: string,
): Response {
  if (Exit.isSuccess(result)) return new Response(serialize(result.value));

  const [reason] = result.cause.reasons;
  if (
    result.cause.reasons.length === 1 &&
    reason !== undefined &&
    Cause.isFailReason(reason)
  ) {
    if (reason.error === DownAdapterRefused) {
      return new Response(serialize({ _tag: 'Refused' }));
    }
    if (isZerospinError(reason.error)) {
      return Response.json({ code: reason.error.code }, { status: 422 });
    }
  }
  return Response.json({ code: failureCode }, { status: 500 });
}
