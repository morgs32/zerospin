import type {
  IAggregateRegistry,
  IAnyAggregateRelease,
} from '@zerospin/core/aggregate/types';
import { getAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import type { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';

/**
 * The executing release selects the entry whose program and result codec run.
 * Ordinary actor commands require exposure in that release's actor contracts.
 * Fresh System, Agent and recorded external commands require their exact invocation grant.
 * The owner contracts map is the derived execution inventory; it is not fresh authority.
 * Retained recovery precedes fresh grants, and replay retains its recorded source release.
 * Resolve the recorded actor independently within this named aggregate registry;
 * ordinary input follows the selected public contract's previous/next lineage,
 * while external input resolves the exact owner-scoped name/version declaration.
 * @bad Require command.aggregateVersion to interpret payloads or retained claims.
 * @bad Grant an ordinary actor every owner contract through contracts-map lookup.
 * @bad Search unrelated actors or services after a missing actor contract.
 * @bad Substitute the latest actor for a retained command's actor version.
 */
export function resolveAggregateContract(props: {
  versions: IAggregateRegistry;
  executionAggregateRelease: IAnyAggregateRelease;
  command: typeof AggregateChainedCommandSchema.Type;
}) {
  const { versions, executionAggregateRelease, command } = props;
  const actor =
    command.kind === 'actor'
      ? getAggregateActorVersion(versions, command)
      : undefined;
  const executionContract =
    command.kind === 'actor'
      ? executionAggregateRelease.actors[command.actorName]?.contracts[
          command.commandName
        ]
      : executionAggregateRelease.contracts[command.commandName];
  return { actor, executionContract };
}
