/**
 * Destructure a props parameter once at the top, then use only those bindings.
 * Fold later destructures into the first declaration and pass explicit fields
 * to callees. Preserve nullable fallback semantics and nested parameter scopes.
 * Decode unknown input before destructuring; retain the complete request at a
 * strict validation boundary. Bind callbacks invoked as props methods to the
 * original receiver during setup, then use the bound local. Keep intentional
 * deferred input reads inside their Effect and explain the execution phase.
 * Preserve render rest props and complete-request forwarding where field
 * presence or identity is part of the boundary's contract.
 *
 * @bad A later `props.serviceVersion` read after the initial destructure.
 * @bad Passing `props` to a callee after that destructure.
 */
export function authorizeServiceFrontend(props: {
  service: { version: number };
  serviceVersion: number;
  actorName: string;
  actorVersion: number;
}) {
  const { service, serviceVersion, actorName, actorVersion } = props;
  if (service.version !== serviceVersion) throw new Error('Unexpected version');
  return resolveActor(service, { actorName, actorVersion });
}

declare function resolveActor(
  service: { version: number },
  identity: { actorName: string; actorVersion: number },
): unknown;
