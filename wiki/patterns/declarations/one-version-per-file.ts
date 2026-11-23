/**
 * Put each concrete versioned declaration in its own file, named for that version.
 * Apply this to model, contract, aggregate, aggregate actor, service actor, and
 * service versions, and to system versions when maintaining multiple authored
 * system versions. Split different declarations even when their versions match.
 * Import individual model and contract versions directly from their defining
 * files. Do not replace models.ts or contracts.ts with a re-export barrel.
 * Package API entrypoints remain valid; this rule governs domain declarations.
 *
 * Import the preceding version when upgrading. Keep supporting schemas, constants,
 * guards, and adapters with their owner unless shared; put shared support in
 * focused modules. Registry modules may import versions to assemble bindings.
 * Keep declarations together inside a genuine domain factory when customization
 * binds those declarations to one another.
 * Return the plain bundle; do not introduce a separate runtime module owner.
 * Keep makeQueryDbVersion inside its actor's file when local to that actor;
 * it does not declare an independent version number.
 * Declare each actor's selections object directly in its version declaration.
 * Never extract selection maps into separate files, import or spread shared
 * selection maps, or assemble them through selection builders. Keep actor-specific
 * identity and SQL predicate constants in the same actor file. This rule applies
 * even when two actors currently select the same rows: each owns its read policy.
 *
 * @bad Multiple concrete versions or declarations in one models.ts or contracts.ts file.
 * @bad Replace models.ts or contracts.ts with index.ts or another declaration re-export barrel.
 * @bad An inline service actor version inside a service version declaration.
 * @bad Import actor selections from another file or spread a shared selection map.
 * @bad Hide unrelated authored versions in a factory just to avoid separate files.
 */
// createPurchaseV2.ts
import { createPurchaseV1 } from './createPurchaseV1';
export const createPurchaseV2 = upgradeAggregateContractRelease(
  createPurchaseV1,
  {
    version: 2,
    // Declare this version's payload, failures, guards, and adapters here.
  },
);
