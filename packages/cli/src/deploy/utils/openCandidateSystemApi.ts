import {
  getOwnerReleaseBindingName,
  OwnerReleaseIdentitySchema,
  VERIFY_OWNER_RELEASE_BINDING_PATH,
  type IOwnerRelease,
} from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystemGatewayRpc } from '@zerospin/core/systemApi/ISystemGatewayRpc';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type {
  ICandidateDeployment,
  IWranglerDeploymentWorkspace,
} from './deploymentTypes.js';
import { openRemoteWorkerBinding } from './openRemoteWorkerBinding.js';

/** Own the forwarder process outside Wrangler's in-process signal/runtime hooks. */
export const openCandidateSystemApi = makeFn('openCandidateSystemApi')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    candidate: Pick<ICandidateDeployment, 'workerName' | 'versionId'>,
  ) {
    const url = yield* openRemoteWorkerBinding(workspace, {
      service: candidate.workerName,
    });
    const systemApi = yield* getApi<ISystemGatewayRpc>(url)(gateway =>
      gateway.getSystemApi({
        zerospinSecretKey: workspace.project.keys.secretKey,
      }),
    );
    return {
      systemApi,
      url,
      readOwnerReleaseBinding: (release: IOwnerRelease) =>
        readOwnerReleaseBinding(workspace, url, candidate.versionId, release),
    };
  },
);

export function listOwnerReleasePins(
  workspace: IWranglerDeploymentWorkspace,
  url: string,
  systemWorkerVersion: string,
) {
  return Effect.tryPromise({
    try: async signal => {
      const response = await fetch(
        new URL(VERIFY_OWNER_RELEASE_BINDING_PATH, url),
        {
          redirect: 'error',
          headers: {
            Authorization: 'Bearer ' + workspace.project.keys.secretKey,
          },
          signal,
        },
      );
      if (
        !response.ok ||
        response.headers.get('X-Zerospin-Worker-Version') !==
          systemWorkerVersion
      ) {
        await response.body?.cancel();
        throw new Error('SystemWorker did not attest its owner release pins');
      }
      return Schema.decodeUnknownSync(Schema.Array(OwnerReleaseIdentitySchema))(
        await response.json(),
        { onExcessProperty: 'error' },
      );
    },
    catch: cause =>
      makeZerospinError({
        code: 'zerospin-owner-release-binding-verification-failed',
        message: 'SystemWorker could not read its owner release pins.',
        cause: prettyUnknownFailure(cause),
      }),
  }).pipe(Effect.timeout('35 seconds'));
}

export function readOwnerReleaseBinding(
  workspace: IWranglerDeploymentWorkspace,
  url: string,
  systemWorkerVersion: string,
  release: IOwnerRelease,
) {
  const bindingName = getOwnerReleaseBindingName(release);
  return Effect.tryPromise({
    try: async signal => {
      const response = await fetch(
        new URL(VERIFY_OWNER_RELEASE_BINDING_PATH, url),
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${workspace.project.keys.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(release),
          signal,
        },
      );
      if (
        response.headers.get('X-Zerospin-Worker-Version') !==
        systemWorkerVersion
      ) {
        await response.body?.cancel();
        throw new Error('SystemWorker did not attest its Worker version');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`SystemWorker returned HTTP ${response.status}`);
      }
      const identity = Schema.decodeUnknownSync(OwnerReleaseIdentitySchema)(
        await response.json(),
        { onExcessProperty: 'error' },
      );
      if (
        identity.systemId !==
          workspace.project.generatedConfig.vars.ZEROSPIN_SYSTEM_ID ||
        getOwnerReleaseBindingName(identity.release) !== bindingName
      ) {
        throw new Error('The binding did not attest the exact owner release');
      }
      return identity;
    },
    catch: cause =>
      makeZerospinError({
        code: 'zerospin-owner-release-binding-verification-failed',
        message: `SystemWorker could not verify ${bindingName}.`,
        cause: prettyUnknownFailure(cause),
      }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: '35 seconds',
      orElse: () =>
        Effect.fail(
          makeZerospinError({
            code: 'zerospin-owner-release-binding-verification-timeout',
            message: `The SystemWorker probe timed out for ${bindingName}.`,
          }),
        ),
    }),
  );
}
