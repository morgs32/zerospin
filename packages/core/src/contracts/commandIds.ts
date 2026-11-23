/** Canonical command IDs are opaque; only the admitting producer constructs them. */
export const makeNodeCommandId = (
  nodeId: string,
  pushIndex: number,
): `cmd_${string}` =>
  `cmd_${encodeURIComponent(JSON.stringify(['node', nodeId, pushIndex]))}`;

export const makeSystemAggregateCommandId = (
  systemId: string,
  aggregateName: string,
  aggregateId: string,
  aggregateIndex: number,
): `cmd_${string}` =>
  `cmd_${encodeURIComponent(JSON.stringify(['system-aggregate', systemId, aggregateName, aggregateId, aggregateIndex]))}`;

export const makeSystemServiceCommandId = (
  systemId: string,
  serviceName: string,
  serviceIndex: number,
): `cmd_${string}` =>
  `cmd_${encodeURIComponent(JSON.stringify(['system-service', systemId, serviceName, serviceIndex]))}`;
