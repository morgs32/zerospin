import assert from 'node:assert/strict';

import { System } from '@zerospin/core/system/System';
import { AggregateVersionRepo } from '@zerospin/owner-release-worker/VersionRepos';
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

// oxlint-disable-next-line eslint/no-restricted-imports -- This fixture exercises the authored Game release.
import { ChooseComputerMove } from '../../../../examples/tic-tac-toe/src/chooseComputerMove.ts';
// oxlint-disable-next-line eslint/no-restricted-imports -- This fixture checks the authored saved-position codec.
import { SavedPositionContentV2 } from '../../../../examples/tic-tac-toe/src/savedPositionV2.ts';
import type { IAdmittedAggregateCommand } from '../../src/AggregateChain/types.ts';
import {
  decodeAggregateEvaluatedCommandRow,
  type IEvaluatedAggregateCommand,
} from '../../src/AggregateVersionChain/evaluatedAggregateCommand.ts';
import { aggregateVersionRepoDbConfig } from '../../src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts';
import { materializeCommandTx } from '../../src/AggregateVersionRepo/materializeCommandTx.ts';
import { requireAuthoredWorkerConfig } from '../../src/workerConfiguration/workerConfiguration.ts';

import { system } from './system.ts';

export class GameReplayWriter extends AggregateVersionRepo {
  replaySavedPosition(input: {
    commands: IEvaluatedAggregateCommand[];
    resources: unknown[];
    head: unknown[];
  }) {
    const { db, schema, key } = this;
    const release = system.aggregates.game.releases[3];
    const gameRows = makeDrizzleSchemaFromTable(release.models.game.table);
    const positions = makeDrizzleSchemaFromTable(
      release.models.savedPosition.table,
    );
    return requireAuthoredWorkerConfig().managedRuntime.runPromise(
      Effect.gen(function* () {
        const commands: IEvaluatedAggregateCommand[] = [];
        for (const command of input.commands) {
          const {
            operations: _operations,
            dispositionChainHash: _hash,
            ...row
          } = command;
          const replay = {
            row,
            aggregateRelease: release,
            key,
            mode: 'replay' as const,
            retainedCommand: null,
          };
          const evaluated = yield* materializeCommandTx(db, replay);
          assert(evaluated, 'Fresh Game replay skipped');
          commands.push(evaluated);
          assert.equal(yield* materializeCommandTx(db, replay), undefined);
        }

        assert.deepEqual(
          commands.flatMap(command =>
            command.operations.map(operation => operation.operationName),
          ),
          ['create', 'update', 'create', 'update', 'update'],
        );
        assert.deepEqual(db.select().from(gameRows).all(), input.resources);
        assert.deepEqual(
          db.select().from(schema.materializationHead).all(),
          input.head,
        );
        const publication = yield* Effect.forEach(
          db.select().from(schema.aggregateVersionChainOutbox).all(),
          row =>
            aggregateVersionRepoDbConfig.tables.aggregateVersionChainOutbox
              .decodeRow(row)
              .pipe(Effect.flatMap(decodeAggregateEvaluatedCommandRow)),
        );
        assert.deepEqual(publication, commands);
        assert.equal(commands[2]?.operations.length, 1);
        const saved = commands[2]?.operations[0];
        assert(saved?.operationName === 'create');
        assert.equal(saved.modelName, 'savedPosition');
        assert.equal(saved.modelVersion, 2);
        assert.equal(saved.resourceId, 'pos_retained');

        const retained = db.select().from(positions).get();
        assert(retained, 'Replayed position is missing');
        assert.equal(retained.id, 'pos_retained');
        assert.deepEqual(
          yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(SavedPositionContentV2),
          )(retained.content),
          { board: 'X........', turn: 'O' },
        );
        const row: IAdmittedAggregateCommand = {
          id: 'cmd_game_new_save',
          aggregateName: 'game',
          aggregateVersion: 3,
          aggregateId: key.aggregateId,
          aggregateIndex: 6,
          kind: 'actor',
          actorName: 'human',
          actorVersion: 3,
          claims: { aggregateId: key.aggregateId, instanceId: 'gam_replay' },
          nodeId: 'node_game_replay',
          sessionName: 'game',
          pushIndex: 5,
          commandName: 'savePosition',
          contractVersion: 2,
          payload: JSON.stringify({
            gameId: 'gam_replay',
            positionId: 'pos_reverse',
          }),
          outcome: null,
        };
        const updated = yield* materializeCommandTx(db, {
          row,
          aggregateRelease: release,
          key,
          mode: 'original',
        });
        assert(updated, 'New V2 save skipped');
        assert.equal(updated.outcome.result._tag, 'Success');
        assert.deepEqual(
          db
            .select()
            .from(positions)
            .all()
            .map(({ id, content }) => ({ id, content })),
          [
            {
              id: 'pos_retained',
              content: JSON.stringify({ board: 'X........', turn: 'O' }),
            },
            {
              id: 'pos_reverse',
              content: JSON.stringify({ board: 'XX..O....', turn: 'O' }),
            },
          ],
        );
        return updated;
      }).pipe(
        Effect.provideService(System, system),
        Effect.provideService(ChooseComputerMove, () =>
          Effect.die(new Error('Replay requested a new computer move')),
        ),
      ),
    );
  }
}
