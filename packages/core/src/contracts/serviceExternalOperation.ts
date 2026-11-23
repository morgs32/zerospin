import type { IInferCommandPayload } from '../models/types.ts';

import type { IServiceExternalContractDefinition } from './defineServiceExternalContract.ts';

export type IServiceExternalOperation<
  CONTRACT extends IServiceExternalContractDefinition =
    IServiceExternalContractDefinition,
> = Readonly<{
  operationName: 'external';
  contract: CONTRACT;
  payload: IInferCommandPayload<CONTRACT['payload']>;
}>;
