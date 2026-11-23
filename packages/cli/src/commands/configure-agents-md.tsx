import { Box, Text } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { configureAgentsMdFn } from '../configureAgentsMd/configureAgentsMdFn.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

export const options = zod.object({
  directory: zod
    .string()
    .optional()
    .describe(
      'Directory containing AGENTS.md; defaults to the current directory',
    ),
  check: zod
    .boolean()
    .default(false)
    .describe('Fail if Zerospin rules are missing or stale; write nothing'),
  dryRun: zod
    .boolean()
    .default(false)
    .describe('Preview the exact before/after documents; write nothing'),
});

export default function ConfigureAgentsMd(props: {
  options: zod.infer<typeof options>;
}) {
  const { options: commandOptions } = props;
  const { data, error, status } = useProgram({
    fetcher: () => configureAgentsMdFn(commandOptions),
  });
  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to configure AGENTS.md"
            error={error ?? null}
          />
          {data && (
            <ProcedureStepSuccess>
              <Box flexDirection="column">
                <Text>{`${data.filePath}: ${commandOptions.dryRun && data.status !== 'current' ? 'would be ' : ''}${data.status}`}</Text>
                {data.preview !== null && <Text>{data.preview}</Text>}
              </Box>
            </ProcedureStepSuccess>
          )}
          <ProcedureStepLoading message="Checking Zerospin agent rules..." />
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
