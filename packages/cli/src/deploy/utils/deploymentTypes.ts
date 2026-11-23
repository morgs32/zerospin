import type { ISystemConfig, ISystemSpec } from '@zerospin/core/system/types';
import type { makeWranglerConfig } from '@zerospin/dev-worker/makeWranglerConfig';

import type { ILoadedOwnerRelease } from '../loadOwnerReleaseSources.js';

export interface IDeploymentProject {
  cwd: string;
  wranglerBinPath: string;
  generatedConfig: ReturnType<typeof makeWranglerConfig>;
  configModulePath: string;
  applicationBindings: ISystemConfig['wrangler'];
  systemSpec: ISystemSpec;
  agentWorkerMain: string;
  aggregateReleaseWorkerMain: string;
  serviceReleaseWorkerMain: string;
  ownerReleases: readonly ILoadedOwnerRelease[];
  keys: { publishableKey: string; secretKey: string };
  telemetrySecretBindingNames: readonly string[];
  telemetrySecrets: Readonly<Record<string, string>>;
}

export interface IWranglerDeploymentWorkspace {
  project: IDeploymentProject;
  directory: string;
  runId: string;
  configPath: string;
  stableSpecPath: string;
  secretsPath: string;
  ownerTelemetrySecretsPath: string | undefined;
  envFilePath: string;
  environment: NodeJS.ProcessEnv;
  /** Writes to each Worker config are serialized until Cloudflare confirms the outcome. */
  pendingCloudflareWrites: Set<string>;
}

export interface IWorkerDeployment {
  id: string;
  created_on: string;
  annotations?: Readonly<Record<string, string>>;
  versions: readonly { version_id: string; percentage: number }[];
}

export interface ICandidateDeployment {
  workerName: string;
  versionId: string;
  incumbentVersionId: string;
  stagedDeploymentId: string;
}
