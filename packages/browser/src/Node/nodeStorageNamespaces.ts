/** Connected storage is selected by authenticated identity, independently of host routing. */
export const makeAggregateNodeNamespace = (sessionKey: string) =>
  `/zerospin/aggregate/${sessionKey}`;

export const makeServiceNodeNamespace = (sessionKey: string) =>
  `/zerospin/service/${sessionKey}`;
