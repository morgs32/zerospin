import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { primitives } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

/**
 * Declare named canonical operation definitions and return an Effect containing only the domain result.
 * Yield injected operations methods; they lazily construct, validate, snapshot and record descriptions.
 * Operation definitions expose .schema and .make; operationsSchema derives the complete batch codec.
 * Names such as createItem are local authoring aliases, never portable operation identities.
 * models declares read access; operations declares mutation permission independently.
 * Use operations: { createItem: item.operations.create }; guards receive no recording methods.
 * Omitted operations records nothing; omitted result requires undefined and persists null.
 * contract.evaluate checks its own guard, scoped reads, failures, operations and result.
 * It applies nothing and creates no resource scope. Nested evaluation shares the owner scope.
 * Each whole-evaluation retry starts with a fresh collector; escaping failure discards its batch.
 * The owning workflow encodes the selected implementation's result before applying any batch.
 * One ordinary program records model, command and same-family external descriptions in both evaluation contexts.
 * Ordinary actor commands retain selected rows/columns; owner guards retain their separate canonical scope.
 * Browser staging/rebase validates the complete batch and applies model operations only, without destination IDs.
 * Reads observe pre-application state; recorded model operations do not grant read-your-writes.
 * Pure defineAggregateExternalContract/defineServiceExternalContract own externalOperation and payload/response codecs.
 * Backend make*ExternalContract(definition, { request, program, ... }) consumes that exact pure definition.
 * External calls accept payload alone and schedule a declaration of the originating release/family.
 * Portable external descriptions retain externalContractName/externalContractVersion and the 'external' discriminator.
 * Only original evaluation freezes external work; AVC/SVC retain complete model/external output.
 * Browser-safe makeCommandOperation binds { aggregate: definition, version } or { service: definition, version }.
 * The exact owner definition and exact claims-free ordinary contract must belong to the registered release.
 * Named command recordings accept payload, plus aggregateId for an aggregate destination.
 * Original execution freezes complete System commands with source model changes and outcome.
 * Admission Chains deliver in source command/operation order until durable admission acknowledgement.
 * Source replay and additional source releases never allocate or dispatch downstream commands.
 * Destination releases replay their own admitted history; changed derivations need a new source command.
 * Projections apply only model operations; replay drops external emissions and never runs requests.
 * Keep original operation indexes when filtering external descriptions; sparse model indexes are valid.
 * Preserve parent command identity and sparse operationIndex in complete operation history.
 * Aggregate pending requests keep six complete invocation fields without parent ID/index;
 * Service pending requests likewise omit parent ID/index and retain their original serviceVersion.
 * Each admission Chain reserves/runs requests by externalCommandId; recording admits the
 * resulting external command and deletes pending work in one synchronous transaction.
 * Opaque request Effects own provider or remote-command destinations, retries and idempotency.
 * Return recorded responses to the originating Chain with the original release and frozen authority.
 * Resolve the exact external declaration using the frozen emitting version in the admission Chain.
 * VersionRepos never run external requests; they retain one complete VersionChain publication.
 * @bad Apply operations while evaluating or grant mutation permission through readable models.
 * @bad Return operation arrays, re-record one program's output in a wrapper, or publish a failed batch.
 * @bad Import completed releases or provider implementations into an ordinary browser program.
 * @bad Re-run an external request or reconstruct frozen input from current declarations after response recording.
 * @bad Offer an alternate continuation recipient or reconstruct source identity from delivery metadata.
 */
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  { version: 1, attributes: { name: primitives.text() }, indexes: [] },
);
export const createItem = makeAggregateContractRelease(
  defineAggregateContract('createItem'),
  {
    version: 1,
    operations: { createItem: item.operations.create },
    payload: {},
    result: Schema.Struct({ itemId: Schema.Literal('itm_one') }),
    program: Effect.fn('createItem.program')(function* ({ operations }) {
      yield* operations.createItem({
        resourceId: 'itm_one',
        attributes: { name: 'One' },
      });
      return { itemId: 'itm_one' };
    }),
  },
);
