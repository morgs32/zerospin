/** Load the serving SystemSpec before dispatching to the framework Worker. */
export function makeSystemWorkerEntrypoint(frameworkMain: string) {
  const entrypoint = JSON.stringify(frameworkMain);
  return [
    'import systemSpec from "./system-spec.txt";',
    `import { configureServingSystemSpec } from ${entrypoint};`,
    'configureServingSystemSpec(systemSpec);',
    `export { default, AggregateChain, ServiceChain, SystemRepo } from ${entrypoint};`,
    '',
  ].join('\n');
}
