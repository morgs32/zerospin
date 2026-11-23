import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { Box, Text } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';
import { seedFn } from '../seed/seedFn.js';

export const args = zod.tuple([
  zod.string().describe('Path to a module exporting a named seeds program'),
]);

export default function Seed(props: { args: zod.infer<typeof args> }) {
  const { args: inputArgs } = props;

  const { error, status } = useProgram({
    fetcher: () =>
      seedFn({ filePath: inputArgs[0] }).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  });

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to seed Zerospin"
            error={error ?? null}
          />
          <ProcedureStepSuccess>
            <Text>Seed program completed</Text>
          </ProcedureStepSuccess>
          <ProcedureStepLoading message="Finalizing seed commands..." />
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
