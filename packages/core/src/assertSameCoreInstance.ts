/** Explain a foreign Zerospin declaration without accepting it across copies. */
export function assertSameCoreInstance(props: {
  value: unknown;
  expected: new () => object;
  kind: 'AggregateContractRelease' | 'ServiceContractRelease' | 'Model';
}): void {
  const { value, expected, kind } = props;
  if (
    value instanceof expected ||
    typeof value !== 'object' ||
    value === null ||
    !Object.hasOwn(value, Symbol.for(`@zerospin/core/${kind}`))
  ) {
    return;
  }

  const name =
    kind !== 'Model'
      ? 'commandName' in value
        ? value.commandName
        : undefined
      : 'modelName' in value
        ? value.modelName
        : undefined;
  const description =
    typeof name === 'string' ? ` ${kind} "${name}"` : ` ${kind}`;
  throw new Error(
    `Multiple copies of @zerospin/core are loaded:${description} was created by another copy. ` +
      'Check bundling and package resolution so all Zerospin imports use one instance.',
  );
}
