/**
 * Name every authored type alias and interface with `I` followed by PascalCase.
 * Include local types, props, inference helpers, predicates, and test/story types.
 * Preserve external declaration-merging names and generated or third-party declarations.
 * Generic type parameters, classes, and runtime values are outside this rule.
 *
 * @bad `type AggregateSessionModel = IAggregateSessionLock['models'][string]`
 * @bad `type AggregateSessionContract = IAggregateSessionLock['contracts'][string]`
 * @bad `type AggregateSessionSpecModel = IAggregateSessionSpec['models'][string]`
 * @bad `type AggregateSessionSpecContract = IAggregateSessionSpec['contracts'][string]`
 */
type IAggregateSessionLock = {
  readonly models: Readonly<Record<string, { readonly version: number }>>;
  readonly contracts: Readonly<Record<string, { readonly version: number }>>;
};

type IAggregateSessionSpec = {
  readonly models: Readonly<Record<string, { readonly version: number }>>;
  readonly contracts: Readonly<Record<string, { readonly version: number }>>;
};

type IAggregateSessionModel = IAggregateSessionLock['models'][string];
type IAggregateSessionContract = IAggregateSessionLock['contracts'][string];
type IAggregateSessionSpecModel = IAggregateSessionSpec['models'][string];
type IAggregateSessionSpecContract = IAggregateSessionSpec['contracts'][string];
