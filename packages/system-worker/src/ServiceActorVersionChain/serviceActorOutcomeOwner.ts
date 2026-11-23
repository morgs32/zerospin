export type IServiceOutcomeOwner = Readonly<{
  actorName: string;
  actorVersion: number;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  nodeId: string | null;
}>;
