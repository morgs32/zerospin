import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { Box, Text } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { packageSystem } from '../package/packageSystem.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

export const options = zod.object({
  platform: zod.literal('ios').describe('Package for the iPhone System host'),
});

export default function Package(_props: { options: { platform: 'ios' } }) {
  const { data, error, status } = useProgram({
    fetcher: () =>
      packageSystem().pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  });
  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to package System"
            error={error ?? null}
          />
          {data && (
            <ProcedureStepSuccess>
              <Text>System package: {data}</Text>
            </ProcedureStepSuccess>
          )}
          <ProcedureStepLoading message="Packaging System..." />
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
