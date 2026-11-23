import * as Context from 'effect/Context';

import type { IServiceSessionCommandExecution } from './types.ts';

export class ServiceSessionCommandExecution extends Context.Service<
  ServiceSessionCommandExecution,
  { getCurrent(): IServiceSessionCommandExecution | undefined }
>()('ServiceSessionCommandExecution') {}
