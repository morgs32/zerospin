import type { IInferCommandPayload } from '../models/types.ts';

import type { IAggregateExternalContractDefinition } from './defineAggregateExternalContract.ts';

export type IAggregateExternalOperation<
  CONTRACT extends IAggregateExternalContractDefinition =
    IAggregateExternalContractDefinition,
> = Readonly<{
  operationName: 'external';
  contract: CONTRACT;
  payload: IInferCommandPayload<CONTRACT['payload']>;
}>;
