import { Box, Text } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';

import { useStudioServer } from './useStudioServer.js';

export const options = zod.object({
  port: zod
    .number()
    .int()
    .min(1)
    .max(65_535)
    .optional()
    .describe('Port for the local Zerospin Studio'),
});

export default function Studio(props: {
  options: { port?: number | undefined };
}) {
  const { options: inputOptions } = props;

  const { data, error, status } = useStudioServer(inputOptions.port);

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to start Zerospin Studio"
            error={error ?? null}
          />
          {data && (
            <ProcedureStepSuccess>
              <Text>Studio running at {data}</Text>
            </ProcedureStepSuccess>
          )}
          <ProcedureStepLoading message="Starting Zerospin Studio..." />
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
