import type { IInferCommandPayload } from '../models/types.ts';

import type { IAnyContracts, IContractRelease } from './types.ts';

/** Command data only; session identity and delivery state belong to the caller. */
export type IInferContractCommands<CONTRACT extends IContractRelease> =
  CONTRACT extends unknown
    ? {
        [VERSION in keyof NonNullable<CONTRACT['__payloads']> & number]: {
          readonly commandName: CONTRACT['commandName'];
          readonly contractVersion: VERSION;
          readonly payload: IInferCommandPayload<
            NonNullable<CONTRACT['__payloads']>[VERSION]
          >;
        };
      }[keyof NonNullable<CONTRACT['__payloads']> & number]
    : never;

/** All accepted payload versions of every contract in a registry. */
export type IInferCommands<CONTRACTS extends IAnyContracts> = {
  [NAME in keyof CONTRACTS]: IInferContractCommands<CONTRACTS[NAME]>;
}[keyof CONTRACTS];
