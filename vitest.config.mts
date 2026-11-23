import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import { workerdProjects } from './vitest.workerd.config.mts';

export default defineConfig(props => {
  const { mode } = props;
  const profile = mode === 'profile';
  const env = { ZEROSPIN_PROFILE: profile ? '1' : '0' };
  const workerConditions = [
    'module',
    'browser',
    'development|production',
    'workerd',
    'worker',
    'zerospin-profile',
  ];

  return {
    test: {
      projects: [
        {
          ...(profile
            ? {
                ssr: {
                  resolve: {
                    conditions: [
                      'module',
                      'node',
                      'development|production',
                      'zerospin-profile',
                    ],
                  },
                },
              }
            : {}),
          test: {
            name: 'node',
            environment: 'node',
            env,
            exclude: [...configDefaults.exclude, '**/*.workerd.spec.ts'],
            include: [
              'examples/shopping/tests/*.spec.ts',
              'examples/tic-tac-toe/tests/*.spec.ts',
              'packages/core/tests/*.spec.ts',
              'packages/error/tests/*.spec.ts',
              'packages/browser/tests/*.spec.ts',
              'packages/cli/tests/*.spec.ts',
              'packages/react/tests/*.spec.tsx',
              'packages/system-worker/tests/**/*.spec.ts',
            ],
          },
        },
        ...workerdProjects.map(project =>
          mergeConfig(project, {
            ...(profile
              ? {
                  resolve: { conditions: workerConditions },
                  ssr: { resolve: { conditions: workerConditions } },
                }
              : {}),
            test: { env },
          }),
        ),
      ],
    },
  };
});
