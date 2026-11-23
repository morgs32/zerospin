# Where “input” means “payload”

**Date:** 2026-10-15  
**Scope:** Current working-tree source, including concurrent uncommitted changes, on 2026-10-15. Observed HEAD during the audit was `e551f2dda217753685666442ae29a15e1ef5c719`; tracked source does not necessarily match that commit. Tables retain the original spelling as audit evidence; source links show the implemented replacements.  
**Status:** Cleanup implemented and verified.

## Completed naming changes

| Original spelling and location                                                                                                                                           | Why this is payload                                                                                                                                                 | Implemented wording/name                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [`machine/types.ts:181–182`](../../packages/machine/src/types.ts#L181-L182): `INPUT extends InferActionPayload<ACTION>`                                                  | The generic constrains an action payload; its parameter is already named `payload`.                                                                                 | Renamed the generic and its reference to `PAYLOAD`. |
| [`validateSubmittedPayload.ts:16`](../../packages/system-worker/src/AggregateChain/admitAggregateCommands/validateSubmittedPayload.ts#L7-L16): `Invalid aggregate input` | The immediately preceding decoder uses `contract.payload`.                                                                                                          | `Invalid aggregate payload`                         |
| [`resolveAggregateExecution.ts:71`](../../packages/system-worker/src/AggregateVersionRepo/utils/resolveAggregateExecution.ts#L66-L71): `Invalid frozen input`            | The decoder reads the retained command's `payload`.                                                                                                                 | `Invalid frozen payload`                            |
| [`resolveServiceExecution.ts:87`](../../packages/system-worker/src/ServiceVersionRepo/utils/resolveServiceExecution.ts#L82-L87): `Invalid frozen input`                  | The service decoder likewise reads `command.payload`.                                                                                                               | `Invalid frozen payload`                            |
| [`ShoppingProviders.ts:28`](../../examples/shopping/src/zerospin/ShoppingProviders.ts#L28-L31): `pay(input)`                                                             | The external request passes `payload` unchanged. [Caller](../../examples/shopping/src/zerospin/aggregates/user/contracts/processExternalPaymentV1.ts#L36-L40).      | `pay(payload)`                                      |
| [`ShoppingProviders.ts:32`](../../examples/shopping/src/zerospin/ShoppingProviders.ts#L32-L34): `createLabel(input)`                                                     | The external request passes `payload` unchanged. [Caller](../../examples/shopping/src/zerospin/aggregates/user/contracts/createExternalTrackingLabelV1.ts#L24-L28). | `createLabel(payload)`                              |
| [`ShoppingProviders.ts:35`](../../examples/shopping/src/zerospin/ShoppingProviders.ts#L35-L39): `refresh(input)`                                                         | The external request passes `payload` unchanged. [Caller](../../examples/shopping/src/zerospin/aggregates/user/contracts/refreshExternalTrackingInfoV1.ts#L29-L33). | `refresh(payload)`                                  |
| `makeMachine.typecheck.ts:59–61` (`packages/machine/src/makeMachine/makeMachine.typecheck.ts`, removed 2026-10-17): typed `input = payload` alias                        | The local variable aliases a payload inside an existing compile-time acceptance case.                                                                               | `checkedPayload`                                    |

The aggregate admission diagnostic was also updated in the existing profile snapshot (`packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommands.profiles.spec.ts`, removed 2026-10-17). The provider changes are example-local parameter names; none of these changes alters a runtime field or schema.

## Documentation wording

| Location                                                                                                                                                                   | Original wording                                                                        | Implemented wording                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [SDK declaration-evolution guidance](../../packages/sdk/skills/zerospin-evolve-declarations/references/declaration-evolution.md#L8-L12)                                    | “input and each output pass that version's codec”                                       | “the source payload and each adapted payload pass the corresponding version's codec.” This passage is explicitly about payload adapters.                               |
| [ADR 012](../adrs/012-opaque-external-work-and-originating-chain-continuations.md#L17)                                                                                     | “frozen input” in a list that separately names contract identity, authority and outcome | “frozen payload.” The authored request API receives `{ payload }`. [Request execution](../../packages/core/src/contracts/externalExecution/executeExternalRequest.ts). |
| [External-work research](external-work-and-continuation-addressing.md#L9), [later passage](external-work-and-continuation-addressing.md#L28)                               | “frozen input”; “frozen authored request input”                                         | “frozen payload”; “frozen authored request payload.” The external operation is payload-only. [Glossary](../glossary.md#L892-L910).                                     |
| [Aggregate execution workflow](https://github.com/morgs32/zerospin/blob/79c1824b1a0353f770211851c0bfe1cc54d0ba46/wiki/architecture/server/executeAggregateCommand.md#L162) | “exact input declaration”                                                               | “exact source contract declaration.” A declaration contains more than the payload schema. [Declaration facts](../../packages/core/src/contracts/types.ts#L224-L327).   |

Archived [Plan 189](../archive/plans/189-plan-aggregate-command-execution-resolution.md#L13) contains the historical wording “input schema.” It remains unchanged and is outside this cleanup's scope.

## Names that do not mean payload alone

Canonical declaration slots, callback members, command envelopes and external request arguments already use `payload`. [Declaration schema](../../packages/core/src/contracts/make/constructContractVersion.ts#L220-L243), [command schemas](../../packages/core/src/contracts/CommandSchema.ts#L25-L35), [external request](../../packages/core/src/contracts/externalExecution/executeExternalRequest.ts).

- `IContractCallbackInput`, `IContractProgramInput`, their `INPUT` type parameter and evaluator/program variables retain their names: `input` is the complete invocation object containing `payload`, claims, `db`, failures, owner scope, `externalOutcome` and program recording operations where applicable. `payload` names only the authored domain-data member. [Types](../../packages/core/src/contracts/types.ts#L171-L196), [glossary](../glossary.md#L526-L535), [example](../../examples/tic-tac-toe/src/contracts/playXServerV1.ts#L16-L34).
- `InferPayloadInput` intentionally permits omitted defaulted fields; `InferCommandPayload` describes the payload after defaults are filled. The qualifier is useful. [Definitions](../../packages/core/src/models/types.ts#L86-L136).
- Session/Node command `Input` types represent complete command envelopes, while replay/projection inputs contain commands or packets. `command` or `packet` may clarify individual variables; `payload` would be incorrect. [Session envelope](../../packages/core/src/contracts/types.ts#L514-L535), [worker original command](../../packages/system-worker/src/AggregateVersionRepo/validateCommandIdentity.ts#L41), [external operation input metadata](../../packages/system-worker/src/externalOperations/prepareExternalOperation.ts#L17).
- Schema predicates' unknown `input` values are descriptors, callbacks, codecs or configuration. They are not decoded command data. [Examples](../../packages/core/src/contracts/make/constructContractVersion.ts#L179-L243).

## Method

The audit followed each candidate to its owned schema, construction or caller. It searched lowercase `input`, `Input` names, uppercase `INPUT` and underscore aliases, excluding vendored dependencies, generated outputs and ordinary HTML input controls. The approved cleanup updates the existing source and documentation occurrences above. No new tests, fixtures or runners were introduced.

## Verification

- `pnpm nx run @zerospin/machine:ts` passed, including the existing compile-time cases.
- `pnpm nx run shopping:tsc:typecheck` passed.
- `pnpm nx run system-worker:test-workerd -- src/AggregateChain/admitAggregateCommands/admitAggregateCommands.profiles.spec.ts` passed both existing profiles, with only the intended rejection message changing.

**Remaining work:** None.
