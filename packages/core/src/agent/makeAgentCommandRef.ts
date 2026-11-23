import type { IContractRelease } from '../contracts/types.ts';

type IClaimsFreeCommand = IContractRelease & {
  readonly external?: undefined;
  readonly claims?: undefined;
};

declare const commandContract: unique symbol;

/** Only the command identity is present at runtime. The contract type fixes its family and payload. */
class AgentCommandRef<CONTRACT extends IContractRelease> {
  declare readonly [commandContract]: CONTRACT;

  constructor(
    readonly commandName: CONTRACT['commandName'],
    readonly version: CONTRACT['version'],
  ) {
    if (!commandName || !Number.isSafeInteger(version) || version < 1) {
      throw new Error(
        'Agent command references require a name and positive integer version',
      );
    }
    Object.freeze(this);
  }
}

export type IAgentCommandRef<
  CONTRACT extends IContractRelease = IContractRelease,
> = AgentCommandRef<CONTRACT>;

export type IAgentCommandRefs<
  CONTRACT extends IContractRelease = IContractRelease,
> = Readonly<Record<string, IAgentCommandRef<CONTRACT>>>;

export function makeAgentCommandRef<
  CONTRACT extends IClaimsFreeCommand = never,
>(
  commandName: CONTRACT['commandName'],
  version: CONTRACT['version'],
): IAgentCommandRef<CONTRACT> {
  return new AgentCommandRef<CONTRACT>(commandName, version);
}

export function isAgentCommandRef(value: unknown): value is IAgentCommandRef {
  return value instanceof AgentCommandRef;
}

/** A grant resolves only against the ordinary, claims-free implementation on this owner release. */
export function resolveAgentCommand<CONTRACT extends IContractRelease>(
  ref: IAgentCommandRef | undefined,
  ownerContracts: Readonly<Record<string, CONTRACT>>,
): CONTRACT | undefined {
  if (ref === undefined || !Object.hasOwn(ownerContracts, ref.commandName)) {
    return undefined;
  }
  const contract = ownerContracts[ref.commandName];
  if (
    contract?.commandName === ref.commandName &&
    contract.version === ref.version &&
    contract.external === undefined &&
    contract.claims === undefined
  ) {
    return contract;
  }
  return undefined;
}
