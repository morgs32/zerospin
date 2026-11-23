/**
 * models grants reads; operations grants exact model/operation mutation permission.
 * A mutation-only model can be absent from models, but must belong to the owner database.
 * Owner and actor registration validate read models and each operation definition's model
 * independently against their exact canonical database graph.
 * One ordinary program reads the actor-selected graph during optimism and canonical actor execution.
 * Ordinary programs and recorded continuations can record command and same-family pure external operation definitions.
 * Each pure external definition resolves to its exact same-family implementation in the owner release.
 * Claims checks inspect the resolved implementation; portable names cannot recreate authority.
 * An explicit claims-free System-Origin ordinary command may read its owner's canonical models.
 * Browser sessions expose public declarations and exclude private external continuations.
 * @bad Treat read access as mutation permission or broaden permission to all owner models.
 * @bad Accept foreign model objects with the same serialized name/version.
 * @bad Treat named map aliases as serialized model or contract identities.
 */
export {};
