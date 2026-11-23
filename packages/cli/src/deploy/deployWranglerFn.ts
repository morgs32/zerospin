import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  ZerospinErrorJsonSchema,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Schema from 'effect/Schema';

import { DeployedZerospin } from './DeployedZerospin.js';
import { awaitSystemRepoVersion } from './utils/awaitSystemRepoVersion.js';
import { bootstrapRecord } from './utils/bootstrapRecord.js';
import { loadDeploymentProject } from './utils/loadDeploymentProject.js';
import { openDeploymentCloudflare } from './utils/openDeploymentCloudflare.js';
import { openWranglerDeploymentWorkspace } from './utils/openWranglerDeploymentWorkspace.js';
import { prepareAgentWorker } from './utils/prepareAgentWorker.js';
import { prepareSystemWorkerCandidate } from './utils/prepareSystemWorkerCandidate.js';
import { promoteSystemWorkerUpdate } from './utils/promoteSystemWorkerUpdate.js';
import { readWorkerDeployment } from './utils/readWorkerDeployment.js';
import { readWorkerVersionBindings } from './utils/readWorkerVersionBindings.js';
import { resolveDeploymentAccount } from './utils/resolveDeploymentAccount.js';
import { runWranglerCommand } from './utils/runWranglerCommand.js';
import { stageSystemWorkerUpdate } from './utils/stageSystemWorkerUpdate.js';
import {
  matchesSystemTrafficIntent,
  systemTrafficRecord,
} from './utils/systemTrafficRecord.js';
import { uploadInitialSystemWorker } from './utils/uploadInitialSystemWorker.js';
import { verifyServingSystem } from './utils/verifyServingSystem.js';
import { verifySystemWorkerCandidate } from './utils/verifySystemWorkerCandidate.js';
import { writeSystemWorkerTraffic } from './utils/writeSystemWorkerTraffic.js';

function progress(milestone: string, message: string) {
  process.stdout.write(milestone + ' · ' + message + '\n');
}

export const deployWranglerFn = makeFn('deployWranglerFn')(
  function* () {
    const loaded = yield* loadDeploymentProject();
    if (loaded.kind === 'keysRequired') return loaded.result;
    const project = loaded.project;
    const { systemName } = project.systemSpec;
    const workerName = project.generatedConfig.name;
    if (
      !/^[a-z][a-z0-9-]*$/.test(systemName) ||
      workerName.length > 63 ||
      workerName !== systemName + '-zerospin'
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-worker-name-invalid',
        message:
          'System name ' +
          JSON.stringify(systemName) +
          ' must produce a valid Cloudflare Worker name ending in -zerospin.',
      });
    }
    const fiber = yield* Effect.fiber;
    const interrupt = () => {
      process.exitCode = 1;
      Effect.runFork(Fiber.interrupt(fiber));
    };
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
    for (const signal of signals) process.on(signal, interrupt);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const signal of signals) process.off(signal, interrupt);
      }),
    );

    const workspace = yield* openWranglerDeploymentWorkspace(project);
    const accountId = yield* resolveDeploymentAccount(workspace);
    const recovery = bootstrapRecord(workspace, accountId);
    const traffic = systemTrafficRecord(workspace, accountId);
    const savedBootstrap = yield* recovery.read;
    const bootstrapPending =
      savedBootstrap !== undefined && savedBootstrap.versionId === undefined;
    if (bootstrapPending) workspace.runId = savedBootstrap.runId;
    progress('Deployment ' + workspace.runId, workerName);

    let promotedVersion: string | undefined;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const priorTraffic = yield* traffic.read;
        const observed = yield* readWorkerDeployment(workspace);
        let deployment = observed.deployment;
        if (
          priorTraffic &&
          !matchesSystemTrafficIntent(deployment, priorTraffic)
        ) {
          if (
            priorTraffic.phase === 'promote' &&
            priorTraffic.preparation?.specHash === project.systemSpec.hash &&
            deployment?.id === priorTraffic.priorDeploymentId &&
            deployment.versions.some(
              version =>
                version.percentage === 0 &&
                version.version_id === priorTraffic.versions[0]?.version_id,
            )
          ) {
            deployment = yield* writeSystemWorkerTraffic(
              workspace,
              traffic,
              priorTraffic,
            );
          } else {
            return yield* makeZerospinError({
              code: 'zerospin-system-traffic-write-pending',
              message:
                'Cloudflare has not confirmed ' +
                priorTraffic.message +
                ' for ' +
                workerName +
                '. Observed deployment: ' +
                (deployment?.id ?? 'none') +
                '. Recovery record: ' +
                traffic.file +
                '.',
            });
          }
        }
        if (savedBootstrap?.versionId && observed.workerAbsent) {
          return yield* makeZerospinError({
            code: 'zerospin-deployment-changed',
            message:
              workerName +
              ' previously served bootstrap ' +
              savedBootstrap.versionId +
              ' but is now absent. Check Cloudflare before restarting the first deploy.',
          });
        }
        const firstDeploy =
          savedBootstrap !== undefined || observed.workerAbsent;
        const uploadOrRecover = observed.workerAbsent || bootstrapPending;
        deployment = uploadOrRecover
          ? yield* uploadInitialSystemWorker(
              workspace,
              accountId,
              recovery,
              bootstrapPending,
            )
          : deployment;
        const serving = yield* verifyServingSystem(
          workspace,
          deployment,
          priorTraffic,
        );
        if (serving.bootstrap && !firstDeploy) {
          return yield* makeZerospinError({
            code: 'zerospin-bootstrap-record-missing',
            message:
              'Cloudflare is serving bootstrap version ' +
              serving.versionId +
              '. Resume from the laptop project that saved its upload record.',
          });
        }
        if (
          (uploadOrRecover && !serving.bootstrap) ||
          (serving.bootstrap &&
            savedBootstrap?.versionId !== undefined &&
            serving.versionId !== savedBootstrap.versionId)
        ) {
          return yield* makeZerospinError({
            code: 'zerospin-bootstrap-version-mismatch',
            message:
              'Serving version ' +
              serving.versionId +
              ' did not match the verified initial upload.',
          });
        }
        progress(
          serving.bootstrap ? 'Bootstrap verified' : 'Serving System verified',
          'Deployment ' +
            serving.deployment.id +
            ', version ' +
            serving.versionId +
            '.',
        );
        progress('Preflight passed', 'Retained SystemSpec is compatible.');

        const { candidate, promotion, agent, ownerPins, owners } =
          yield* Effect.gen(function* () {
            if (priorTraffic?.phase === 'promote') {
              const preparation = priorTraffic.preparation;
              if (
                !preparation ||
                preparation.specHash !== project.systemSpec.hash
              ) {
                return yield* makeZerospinError({
                  code: 'zerospin-system-traffic-record-invalid',
                  message:
                    'Restore the System declaration used for the interrupted promotion before retrying.',
                });
              }
              promotedVersion = serving.versionId;
              const bindings = yield* readWorkerVersionBindings(
                workspace,
                serving.versionId,
              );
              const agentWorker = yield* prepareAgentWorker(
                workspace,
                bindings,
                false,
              );
              const agent = yield* agentWorker.stage(
                yield* agentWorker.provision,
                [],
                {
                  versionId: preparation.agentVersionId,
                  priorDeploymentId: preparation.agentPriorDeploymentId,
                },
              );
              return {
                candidate: { workerName, versionId: serving.versionId },
                promotion: serving.deployment,
                agent,
                ownerPins: preparation.ownerReleases,
                owners: undefined,
              };
            }
            const prepared = yield* prepareSystemWorkerCandidate(
              workspace,
              serving,
            );
            const candidate = yield* stageSystemWorkerUpdate(
              workspace,
              serving.deployment,
              traffic,
            );
            const promotion = yield* promoteSystemWorkerUpdate(
              workspace,
              candidate,
              traffic,
              {
                specHash: project.systemSpec.hash,
                ownerReleases: prepared.ownerPins,
                agentVersionId: prepared.agent.versionId,
                agentPriorDeploymentId: prepared.agent.priorDeploymentId,
              },
            );
            promotedVersion = candidate.versionId;
            return { candidate, promotion, ...prepared };
          });
        progress(
          'Candidate promoted',
          'Deployment ' +
            promotion.id +
            ', version ' +
            candidate.versionId +
            '.',
        );
        const systemApi = yield* verifySystemWorkerCandidate(
          workspace,
          candidate,
          ownerPins,
          agent,
          owners,
        );
        yield* systemApi.acceptSystemSpec({
          expectedVersionId: candidate.versionId,
        });
        progress(
          'SystemSpec accepted',
          'SystemRepo accepted version ' + candidate.versionId + '.',
        );
        yield* awaitSystemRepoVersion(systemApi, candidate);
        yield* agent.activate;
        yield* systemApi
          .initialize({ expectedVersionId: candidate.versionId })
          .pipe(
            Effect.mapError(cause =>
              makeZerospinError({
                code: 'zerospin-deployment-readiness-failed',
                message:
                  'SystemApi.initialize failed after promoting ' +
                  workerName +
                  ' version ' +
                  candidate.versionId +
                  '.',
                cause: prettyUnknownFailure(cause),
              }),
            ),
          );
        const finalDeployment = (yield* readWorkerDeployment(workspace))
          .deployment;
        if (finalDeployment?.id !== promotion.id) {
          return yield* makeZerospinError({
            code: 'zerospin-deployment-changed',
            message:
              'Cloudflare changed deployment ' +
              promotion.id +
              ' during initialization.',
          });
        }
        if (firstDeploy) {
          yield* runWranglerCommand(workspace, ['triggers', 'deploy'], {
            writesCloudflare: true,
          });
          const cloudflare = yield* openDeploymentCloudflare(
            workspace,
            accountId,
          );
          yield* Effect.tryPromise({
            try: async signal => {
              const { enabled, previews_enabled } =
                await cloudflare.readIngress(signal);
              if (!enabled || previews_enabled) {
                throw new Error(
                  'Expected workers.dev enabled and preview URLs disabled.',
                );
              }
            },
            catch: cause =>
              makeZerospinError({
                code: 'zerospin-first-deploy-ingress-unverified',
                message:
                  'Could not verify public ingress for ' + workerName + '.',
                cause: prettyUnknownFailure(cause),
              }),
          });
          const publicDeployment = (yield* readWorkerDeployment(workspace))
            .deployment;
          if (publicDeployment?.id !== promotion.id) {
            return yield* makeZerospinError({
              code: 'zerospin-deployment-changed',
              message:
                'Cloudflare changed deployment ' +
                promotion.id +
                ' during the public cutover.',
            });
          }
          yield* recovery.clear;
        }
        yield* traffic.clear;
        progress(
          'Live',
          workerName +
            ' version ' +
            candidate.versionId +
            ' is verified and initialized.',
        );
        return DeployedZerospin.make({
          data: {
            workerName,
            versionId: candidate.versionId,
            zerospinPublishableKey: project.keys.publishableKey,
          },
        });
      }),
    ).pipe(
      Effect.onExit(exit =>
        Effect.sync(() => {
          if (Exit.isSuccess(exit)) return;
          if (promotedVersion || workspace.pendingCloudflareWrites.size > 0) {
            progress(
              'Recovery required',
              'Inspect Cloudflare for run ' +
                workspace.runId +
                (promotedVersion
                  ? ', promoted version ' + promotedVersion
                  : '') +
                '.',
            );
          }
        }),
      ),
    );
  },
  Effect.scoped,
  Effect.mapError(cause => {
    if (isZerospinError(cause)) return cause;
    if (Schema.is(ZerospinErrorJsonSchema)(cause)) {
      return makeZerospinError<typeof cause.code>(cause);
    }
    return makeZerospinError({
      code: 'zerospin-deployment-failed',
      message: 'Deployment failed.',
      cause: prettyUnknownFailure(cause),
    });
  }),
);
