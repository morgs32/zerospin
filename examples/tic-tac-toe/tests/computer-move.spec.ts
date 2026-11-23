import { describe, expect, it } from '@effect/vitest';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { validateAggregateCommand } from '@zerospin/core/contracts/validateAggregateCommand';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { encodeRowAsResource } from '@zerospin/core/models/encodeRowAsResource';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import { replayAggregateCommandTx } from '@zerospin/core/sessionExecution/replayAggregateCommandTx';
import { executeHarnessCommand } from '@zerospin/core/testing/systemHarness/executeHarnessCommand';
import { makeSystemHarness } from '@zerospin/core/testing/systemHarness/makeSystemHarness';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { CuidFactory } from '@zerospin/shapes';
import * as Cause from 'effect/Cause';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import * as TestClock from 'effect/testing/TestClock';

import { openTestDb } from '../../../tests/support/openTestDb.ts';
import { ChooseComputerMove } from '../src/chooseComputerMove.ts';
import { playX } from '../src/contracts/playXV1.ts';
import { aggregateRelease } from '../src/gameAggregateReleaseV1.ts';
import { gameSessionDefinition } from '../src/gameSessionDefinition.ts';
import { game, outcome, turn } from '../src/gameV1.ts';
import { system } from '../src/system.ts';

describe('Tic-Tac-Toe board and computer move', () => {
  it('derives alternating turns, all eight winning lines and a draw', () => {
    expect([turn('.........'), turn('X........'), turn('XO.......')]).toEqual([
      'X',
      'O',
      'X',
    ]);
    expect([turn('XX.......'), turn('O........')]).toEqual([null, null]);
    for (const board of [
      'XXXOO....',
      'OO.XXX...',
      'OO....XXX',
      'XO.XO.X..',
      'OX..X..XO',
      'O.XO.X..X',
      'XO..XO..X',
      'O.X.X.X.O',
    ]) {
      expect(outcome(board)).toBe('X');
      expect(turn(board)).toBeNull();
    }
    expect(outcome('XX.OOOX..')).toBe('O');
    expect(turn('XX.OOOX..')).toBeNull();
    expect(outcome('XOXOOXXXO')).toBe('draw');
    expect(turn('XOXOOXXXO')).toBeNull();
    expect(outcome('XO.......')).toBe('playing');
  });

  it.effect(
    'keeps local and canonical move guards and emits O work only while playing',
    () =>
      Effect.gen(function* () {
        const { db, config, readDb } = yield* openTestDb(
          aggregateRelease.models,
        );
        const now = new Date('2026-10-27T12:00:00Z');
        db.insert(config.schema.game)
          .values([
            {
              id: 'gam_one',
              createdAt: now,
              updatedAt: now,
              board: 'XO.......',
              computerMoveFailure: null,
            },
            {
              id: 'gam_winning',
              createdAt: now,
              updatedAt: now,
              board: 'XX.OO....',
              computerMoveFailure: null,
            },
            {
              id: 'gam_terminal',
              createdAt: now,
              updatedAt: now,
              board: 'XXXOO....',
              computerMoveFailure: null,
            },
          ])
          .run();
        for (const { payload, instanceId } of [
          {
            payload: { id: 'gam_one', board: 'XO.......', square: 2 },
            instanceId: 'gam_other',
          },
          {
            payload: { id: 'gam_missing', board: '.........', square: 2 },
            instanceId: 'gam_missing',
          },
          {
            payload: { id: 'gam_one', board: '.........', square: 2 },
            instanceId: 'gam_one',
          },
          ...[-1, 9, 2.5, 0].map(square => ({
            payload: { id: 'gam_one' as const, board: 'XO.......', square },
            instanceId: 'gam_one',
          })),
          {
            payload: { id: 'gam_terminal', board: 'XXXOO....', square: 5 },
            instanceId: 'gam_terminal',
          },
        ] as const) {
          const claims = { aggregateId: 'game_one', instanceId };
          const command = {
            kind: 'actor' as const,
            actorName: 'human',
            actorVersion: 1,
            sessionName: 'gameSession',
            sessionId: 'sesn_test' as const,
            aggregateName: 'game',
            aggregateVersion: 1,
            aggregateId: claims.aggregateId,
            commandName: playX.commandName,
            contractVersion: playX.version,
            payload,
            claims,
          };
          const local = yield* Effect.exit(
            playX.evaluate({
              command,
              claims,
              db: readDb,
            }),
          );
          if (Exit.isSuccess(local)) {
            expect.fail('Expected local execution to refuse the move');
          }
          if (!Number.isInteger(payload.square)) {
            expect(Cause.squash(local.cause)).toMatchObject({
              code: 'validate-command-payload-failed',
            });
            continue;
          }
          expect(Cause.squash(local.cause)).toMatchObject({
            code: 'invalid-move',
          });
          const canonical = yield* Effect.exit(
            validateAggregateCommand({
              aggregateRelease,
              actorName: 'human',
              contract: playX,
              db,
              command,
              payload,
              claims,
            }).pipe(
              Effect.updateContext<never, unknown>(() =>
                Context.makeUnsafe<unknown>(new Map()),
              ),
            ),
          );
          if (Exit.isSuccess(canonical)) {
            expect.fail(
              'Expected the canonical owner guard to refuse the move',
            );
          }
          expect(Cause.squash(canonical.cause)).toMatchObject({
            code: 'aggregate-guard-failed',
          });
        }
        for (const [id, board, square, nextBoard, requests] of [
          ['gam_one', 'XO.......', 2, 'XOX......', 1],
          ['gam_winning', 'XX.OO....', 2, 'XXXOO....', 0],
        ] as const) {
          const claims = { aggregateId: 'game_one', instanceId: id };
          const evaluated = yield* playX.evaluate({
            command: {
              kind: 'actor',
              actorName: 'human',
              actorVersion: 1,
              sessionName: 'gameSession',
              sessionId: 'sesn_test',
              aggregateName: 'game',
              aggregateVersion: 1,
              aggregateId: 'game_one',
              commandName: playX.commandName,
              contractVersion: playX.version,
              payload: { id, board, square },
              claims,
            },
            claims,
            db: readDb,
          });
          expect(evaluated.result).toBeNull();
          expect(
            yield* Schema.encodeEffect(playX.operationsSchema)(
              evaluated.operations,
            ),
          ).toEqual([
            {
              modelName: 'game',
              modelVersion: 1,
              operationName: 'update',
              resourceId: id,
              body: JSON.stringify({ attributes: { board: nextBoard } }),
            },
            ...(requests === 0
              ? []
              : [
                  {
                    operationName: 'external',
                    externalContractName: 'playExternalOMove',
                    externalContractVersion: 1,
                    payload: { id, board: nextBoard },
                  },
                ]),
          ]);
        }
        expect(
          db.query.game.findFirst({ where: { id: { eq: 'gam_one' } } }).sync()
            ?.board,
        ).toBe('XO.......');
      }),
  );

  it.effect(
    'applies X and the chosen O move with the five-field Game envelope',
    () =>
      Effect.gen(function* () {
        let requests = 0;
        const harness = yield* makeSystemHarness({
          system,
          layer: () =>
            Layer.succeed(ChooseComputerMove, board =>
              Effect.sync(() => {
                requests++;
                expect(board).toBe('X........');
                return 4;
              }),
            ),
        });
        const owner = { release: aggregateRelease, aggregateId: 'game_one' };
        const queries = makeQueryDbVersion({ models: aggregateRelease.models });
        const command = {
          aggregateName: 'game',
          aggregateVersion: 1,
          aggregateId: owner.aggregateId,
          kind: 'actor',
          actorName: 'human',
          actorVersion: 1,
          contractVersion: 1,
          claims: { aggregateId: owner.aggregateId, instanceId: 'gam_one' },
          nodeId: 'node_one',
          sessionName: 'gameSession',
        } as const;
        yield* harness.push({
          ...command,
          id: 'cmd_create',
          commandName: 'createGame',
          pushIndex: 1,
          payload: { id: 'gam_one' },
        });
        yield* harness.push({
          ...command,
          id: 'cmd_x',
          commandName: 'playX',
          pushIndex: 2,
          payload: { id: 'gam_one', board: '.........', square: 0 },
        });
        expect(requests).toBe(0);
        expect(
          yield* harness.query(owner, queries.query.game.findFirst({})),
        ).toMatchObject({ board: 'X........', computerMoveFailure: null });
        yield* harness.flush();
        yield* harness.flush();
        expect(requests).toBe(1);
        const stored = yield* harness.query(
          owner,
          queries.query.game.findFirst({}),
        );
        if (stored === undefined) expect.fail('Expected the applied Game');
        expect(stored).toMatchObject({
          id: 'gam_one',
          board: 'X...O....',
          computerMoveFailure: null,
        });
        expect(Object.keys(stored).sort()).toEqual([
          'board',
          'computerMoveFailure',
          'createdAt',
          'id',
          'updatedAt',
        ]);
        const encoded = yield* encodeRowAsResource(game, stored);
        expect(Object.keys(encoded).sort()).toEqual([
          'board',
          'computerMoveFailure',
          'createdAt',
          'id',
          'modelName',
          'updatedAt',
          'version',
        ]);
        expect(
          Schema.decodeUnknownSync(game.resourceJsonCodec)(
            JSON.parse(JSON.stringify(encoded)),
          ),
        ).toMatchObject({
          modelName: 'game',
          version: 1,
          board: 'X...O....',
          computerMoveFailure: null,
        });
        const { db } = yield* openTestDb(aggregateRelease.models);
        expect(
          db.values('PRAGMA table_info("game")').map(row => row[1]),
        ).toEqual([
          'id',
          'createdAt',
          'updatedAt',
          'board',
          'computerMoveFailure',
        ]);
      }).pipe(Effect.provide(NanoIdFactory)),
  );

  it.effect(
    'retains a handled chooser Failure without moving or scheduling a retry',
    () =>
      Effect.gen(function* () {
        let requests = 0;
        const harness = yield* makeSystemHarness({
          system,
          layer: () =>
            Layer.succeed(ChooseComputerMove, () =>
              Effect.sync(() => {
                requests++;
              }).pipe(Effect.andThen(Effect.never)),
            ),
        });
        const owner = {
          release: aggregateRelease,
          aggregateId: 'game_failure',
        };
        const queries = makeQueryDbVersion({ models: aggregateRelease.models });
        const command = {
          aggregateName: 'game',
          aggregateVersion: 1,
          aggregateId: owner.aggregateId,
          kind: 'actor',
          actorName: 'human',
          actorVersion: 1,
          contractVersion: 1,
          claims: { aggregateId: owner.aggregateId, instanceId: 'gam_failure' },
          nodeId: 'node_failure',
          sessionName: 'gameSession',
        } as const;
        yield* harness.push({
          ...command,
          id: 'cmd_failure_create',
          commandName: 'createGame',
          pushIndex: 1,
          payload: { id: 'gam_failure' },
        });
        yield* harness.push({
          ...command,
          id: 'cmd_failure_x',
          commandName: 'playX',
          pushIndex: 2,
          payload: { id: 'gam_failure', board: '.........', square: 0 },
        });
        const flushing = yield* harness.flush().pipe(Effect.forkChild);
        yield* TestClock.adjust('30 seconds');
        yield* Fiber.join(flushing);
        yield* harness.flush();
        expect(requests).toBe(1);
        expect(
          yield* harness.query(owner, queries.query.game.findFirst({})),
        ).toMatchObject({
          board: 'X........',
          computerMoveFailure:
            'External request ended without a usable response',
        });
      }).pipe(Effect.provide(NanoIdFactory)),
  );

  it.effect(
    'refuses stale O observations and clears a retained failure only on a valid application',
    () =>
      Effect.gen(function* () {
        const { db, config } = yield* openTestDb(aggregateRelease.models);
        const recordedAt = new Date('2026-10-27T12:00:00Z');
        db.insert(config.schema.game)
          .values([
            {
              id: 'gam_one',
              createdAt: recordedAt,
              updatedAt: recordedAt,
              board: 'X........',
              computerMoveFailure: 'Earlier request failed',
            },
            {
              id: 'gam_other',
              createdAt: recordedAt,
              updatedAt: recordedAt,
              board: '.........',
              computerMoveFailure: null,
            },
          ])
          .run();
        const store = {
          kind: 'aggregate',
          release: aggregateRelease,
          aggregateId: 'game_one',
          db,
        } as const;
        const command = {
          id: 'cmd_o',
          kind: 'system',
          commandName: 'applyComputerMove',
          contractVersion: 1,
          aggregateName: 'game',
          aggregateVersion: 1,
          aggregateId: store.aggregateId,
        } as const;
        for (const [id, board, square] of [
          ['gam_other', 'X........', 4],
          ['gam_missing', 'X........', 4],
          ['gam_one', 'XO.......', 4],
          ['gam_one', 'X........', 0],
          ['gam_one', 'X........', 9],
        ] as const) {
          const refused = yield* Effect.exit(
            executeHarnessCommand({
              system,
              store,
              framework: true,
              command: {
                ...command,
                payload: { id, board, square, requestFailure: null },
              },
            }).pipe(
              Effect.updateContext<never, unknown>(() =>
                Context.makeUnsafe<unknown>(new Map()),
              ),
            ),
          );
          if (Exit.isSuccess(refused)) {
            expect.fail(
              'Expected the O continuation guard to refuse the observation',
            );
          }
          expect(Cause.squash(refused.cause)).toMatchObject({
            code: 'invalid-move',
          });
        }
        expect(
          db.query.game.findFirst({ where: { id: { eq: 'gam_one' } } }).sync(),
        ).toMatchObject({
          board: 'X........',
          computerMoveFailure: 'Earlier request failed',
        });
        const applied = yield* executeHarnessCommand({
          system,
          store,
          framework: true,
          command: {
            ...command,
            payload: {
              id: 'gam_one',
              board: 'X........',
              square: 4,
              requestFailure: null,
            },
          },
        }).pipe(
          Effect.updateContext<never, unknown>(() =>
            Context.makeUnsafe<unknown>(new Map()),
          ),
        );
        expect(applied.work).toEqual([]);
        expect(
          db.query.game.findFirst({ where: { id: { eq: 'gam_one' } } }).sync(),
        ).toMatchObject({ board: 'X...O....', computerMoveFailure: null });
        expect(
          db.query.game
            .findFirst({ where: { id: { eq: 'gam_other' } } })
            .sync(),
        ).toMatchObject({ board: '.........', computerMoveFailure: null });
      }),
  );

  it.effect(
    'replays Game optimism without allocating or running external work',
    () =>
      Effect.gen(function* () {
        const { db, config } = yield* openTestDb(aggregateRelease.models);
        const stagedAt = new Date('2026-10-27T12:00:00Z');
        db.insert(config.schema.game)
          .values({
            id: 'gam_one',
            createdAt: stagedAt,
            updatedAt: stagedAt,
            board: '.........',
            computerMoveFailure: null,
          })
          .run();
        const command = {
          commandName: 'playX',
          contractVersion: 1,
          kind: 'actor' as const,
          actorName: 'human',
          actorVersion: 1,
          sessionName: 'gameSession',
          sessionId: 'sesn_test' as const,
          aggregateName: 'game',
          aggregateVersion: 1,
          aggregateId: 'game_one',
          claims: { aggregateId: 'game_one', instanceId: 'gam_one' },
          payload: yield* encodePayload(playX, {
            version: 1,
            payload: { id: 'gam_one', board: '.........', square: 0 },
          }),
        };
        let allocations = 0;
        let requests = 0;
        const replay = makeTx('replayGameOptimism')(function* (tx) {
          return yield* replayAggregateCommandTx({
            tx,
            definition: gameSessionDefinition,
            command,
            aggregateId: 'game_one',
            claims: { aggregateId: 'game_one', instanceId: 'gam_one' },
            stagedAt,
          });
        });
        const inverses = yield* replay(db).pipe(
          Effect.provideService(CuidFactory, () =>
            Effect.sync(() => {
              allocations++;
              return 'unexpected';
            }),
          ),
          Effect.provideService(ChooseComputerMove, () =>
            Effect.sync(() => {
              requests++;
              return 4;
            }),
          ),
        );
        expect(inverses).toMatchObject([
          {
            operationName: 'update',
            modelName: 'game',
            modelVersion: 1,
            resourceId: 'gam_one',
          },
        ]);
        expect(db.query.game.findFirst().sync()).toMatchObject({
          board: 'X........',
          computerMoveFailure: null,
        });
        expect(yield* replay(db)).toBeNull();
        expect(allocations).toBe(0);
        expect(requests).toBe(0);
      }),
  );
});

it.effect(
  'keeps Actor-selected reads and owner guards while refusing absent System and Agent grants',
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const owner = { release: aggregateRelease, aggregateId: 'game_shared' };
      const db = makeQueryDbVersion({ models: aggregateRelease.models });
      const command = {
        aggregateName: aggregateRelease.name,
        aggregateVersion: aggregateRelease.version,
        aggregateId: owner.aggregateId,
        contractVersion: 1,
      } as const;
      for (const instanceId of ['gam_one', 'gam_two'] as const) {
        yield* harness.push({
          ...command,
          id: `cmd_create_${instanceId}`,
          commandName: 'createGame',
          kind: 'actor',
          actorName: 'human',
          actorVersion: 1,
          claims: { aggregateId: owner.aggregateId, instanceId },
          nodeId: `node_create_${instanceId}`,
          sessionName: 'gameSession',
          pushIndex: 1,
          payload: { id: instanceId },
        });
      }
      // createGame's unqualified read cannot see the other Actor selection.
      expect(
        yield* harness.query(owner, db.query.game.findMany({})),
      ).toMatchObject([
        { id: 'gam_one', board: '.........' },
        { id: 'gam_two', board: '.........' },
      ]);
      const wrongSystem = yield* harness
        .push({
          ...command,
          id: 'cmd_forbidden_system',
          commandName: 'createGame',
          kind: 'system',
          payload: { id: 'gam_three' },
        })
        .pipe(Effect.flip);
      const wrongAgent = yield* harness
        .push({
          ...command,
          id: 'cmd_forbidden_agent',
          commandName: 'createGame',
          kind: 'agent',
          agentName: 'missing',
          agentVersion: 1,
          payload: { id: 'gam_three' },
        })
        .pipe(Effect.flip);
      expect(wrongSystem).toMatchObject({
        code: 'system-harness-command-forbidden',
      });
      expect(wrongAgent).toMatchObject({
        code: 'system-harness-command-forbidden',
      });
      const move = {
        ...command,
        commandName: 'playX',
        kind: 'actor',
        actorName: 'human',
        actorVersion: 1,
        nodeId: 'node_move',
        sessionName: 'gameSession',
        pushIndex: 1,
        payload: { id: 'gam_one', board: '.........', square: 0 },
      } as const;
      expect(
        yield* harness
          .push({
            ...move,
            id: 'cmd_wrong_claims',
            claims: { aggregateId: owner.aggregateId, instanceId: 'gam_two' },
          })
          .pipe(Effect.flip),
      ).toMatchObject({ code: 'aggregate-guard-failed' });
      yield* harness.push({
        ...move,
        id: 'cmd_own_move',
        claims: { aggregateId: owner.aggregateId, instanceId: 'gam_one' },
      });
      expect(
        yield* harness.query(owner, db.query.game.findMany({})),
      ).toMatchObject([
        { id: 'gam_one', board: 'X........' },
        { id: 'gam_two', board: '.........' },
      ]);
    }).pipe(Effect.provide(NanoIdFactory)),
);
