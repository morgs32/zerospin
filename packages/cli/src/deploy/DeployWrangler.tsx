import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { Box, Text } from 'ink';

import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { deployWranglerFn } from './deployWranglerFn.js';

export function DeployWrangler() {
  const { data, error, status } = useProgram({
    fetcher: () =>
      deployWranglerFn().pipe(
        Effect.provide(
          NodeChildProcessSpawner.layer.pipe(
            Layer.provideMerge(
              Layer.mergeAll(NodeFileSystem.layer, NodePath.layer),
            ),
          ),
        ),
      ),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to deploy Zerospin with Wrangler"
        error={error ?? null}
      />
      {data?.code === 'production-keys-generated' && (
        <ProcedureStepSuccess>
          <Box flexDirection="column">
            <Text>Production Zerospin keys generated; nothing deployed.</Text>
            <Text>
              Copy these values into {data.data.envFilePath}, then rerun
              `zerospin deploy`:
            </Text>
            <Text>
              ZEROSPIN_PUBLISHABLE_KEY={data.data.zerospinPublishableKey}
            </Text>
            <Text>ZEROSPIN_SECRET_KEY={data.data.zerospinSecretKey}</Text>
            <Text>
              Keep ZEROSPIN_SECRET_KEY private. Expose only
              ZEROSPIN_PUBLISHABLE_KEY to clients.
            </Text>
          </Box>
        </ProcedureStepSuccess>
      )}
      {data?.code === 'zerospin-deployed' && (
        <ProcedureStepSuccess>
          <Box flexDirection="column">
            <Text>Production Zerospin deploy succeeded.</Text>
            <Text>Worker: {data.data.workerName}</Text>
            <Text>Version: {data.data.versionId}</Text>
            <Text>Application variables:</Text>
            <Text>
              ZEROSPIN_PUBLISHABLE_KEY={data.data.zerospinPublishableKey}
            </Text>
          </Box>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Deploying Zerospin through Wrangler..." />
    </ProcedureStep>
  );
}
