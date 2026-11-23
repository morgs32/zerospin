import { Box } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { Dev as DevStep } from '../dev/Dev.js';

export const options = zod.object({
  clean: zod
    .boolean()
    .default(false)
    .describe('Delete local Zerospin Durable Object state before serving'),
  port: zod
    .number()
    .int()
    .min(1)
    .max(65_535)
    .optional()
    .describe('Port for the local Zerospin API'),
  stateDir: zod
    .string()
    .min(1)
    .optional()
    .describe('Parent directory for local Zerospin System state'),
  sharedR2: zod
    .string()
    .min(1)
    .optional()
    .describe('Wrangler --persist-to directory containing shared local R2'),
});

export default function Dev(props: { options: zod.infer<typeof options> }) {
  const { options: commandOptions } = props;

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <DevStep {...commandOptions} />
      </Box>
    </ErrorBoundary>
  );
}
