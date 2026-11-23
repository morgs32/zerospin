import type { IServiceContractExtension } from '../contracts/makeServiceContractExtension.ts';
import type { IServiceContracts } from '../contracts/types.ts';
import type { IOwnerReleaseLayer } from '../execution/ownerReleaseLayer.ts';
import type { IAnyModels } from '../models/types.ts';
import type { IAnyServiceActorRelease } from '../serviceActor/types.ts';

export type IServiceRelease<
  NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  CONTRACTS extends IServiceContracts = IServiceContracts,
  ACTORS extends Record<string, IAnyServiceActorRelease> = Record<
    string,
    IAnyServiceActorRelease
  >,
  VERSION extends number = number,
  SYSTEM extends IServiceContracts = IServiceContracts,
  EXTERNAL extends IServiceContracts = IServiceContracts,
> = {
  readonly extensions: Readonly<Record<string, IServiceContractExtension>>;
  readonly actors: Readonly<ACTORS>;
  readonly layer?: IOwnerReleaseLayer;
  readonly definition: Readonly<{ name: NAME }>;
  readonly name: NAME;
  readonly version: VERSION;
  readonly models: Readonly<MODELS>;
  readonly contracts: Readonly<CONTRACTS>;
  readonly system: Readonly<SYSTEM>;
  readonly external: Readonly<EXTERNAL>;
};
export type IAnyServiceRelease = {
  readonly extensions: Readonly<Record<string, IServiceContractExtension>>;
  readonly actors: Readonly<Record<string, IAnyServiceActorRelease>>;
  readonly layer?: IOwnerReleaseLayer;
  readonly definition: Readonly<{ name: string }>;
  readonly name: string;
  readonly version: number;
  readonly models: IAnyModels;
  readonly contracts: IServiceContracts;
  readonly system: IServiceContracts;
  readonly external: IServiceContracts;
};

export type IServiceRegistry = Readonly<Record<number, IAnyServiceRelease>>;
