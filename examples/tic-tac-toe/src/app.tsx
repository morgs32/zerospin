import { useState } from 'react';

import {
  useSession,
  SessionProvider,
  SessionReady,
  useConnectedAggregateSession,
  useLiveQuery,
} from '@zerospin/react';
import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { applicationLayer } from './applicationLayer';
import workerUrl from './game.node.worker?sharedworker&url';
import { gameSessionDefinition } from './gameSessionDefinition';
import { credentialsSchema } from './gameV1';
import { game, outcome, turn } from './gameV1';
import { savedPositionV2 } from './savedPositionV2';

const stored = localStorage.getItem('tic-tac-toe-game');
const token = stored ?? crypto.randomUUID();
localStorage.setItem('tic-tac-toe-game', token);
const id = sdk.prefixId(game, token);
const claims = { aggregateId: token, instanceId: id };
export function App() {
  const session = useConnectedAggregateSession(gameSessionDefinition, {
    sharedWorkerUrl: workerUrl,
    credentialsSchema,
    layer: applicationLayer,
    aggregateId: claims.aggregateId,
    expectedClaims: claims,
    getCredentials: () => Effect.succeed({ instanceId: id }),
  });
  return (
    <SessionProvider session={session}>
      <main>
        <p className="eyebrow">ZEROSPIN · BACKEND OPPONENT</p>
        <h1>Tic-Tac-Toe</h1>
        <p>You play X. Your opponent plays O, even with this tab closed.</p>
        <SessionReady
          definition={gameSessionDefinition}
          fallback={<p>Connecting…</p>}
          renderError={error => (
            <section role="alert">
              <h1>404</h1>
              <p>This session is unavailable.</p>
              <pre>
                {error instanceof Error ? error.message : String(error)}
              </pre>
            </section>
          )}
        >
          <Board />
        </SessionReady>
      </main>
    </SessionProvider>
  );
}

function Board() {
  const gameSession = useSession(gameSessionDefinition);
  const { data: current } = useLiveQuery({
    session: gameSession,
    query: db => db.query.game.findFirst({ where: { id: { eq: id } } }),
  });
  const { data: savedPositions } = useLiveQuery({
    session: gameSession,
    key: id,
    query: (db, gameId) =>
      db.query.savedPosition.findMany({
        where: { gameId: { eq: gameId } },
        orderBy: { createdAt: 'desc', id: 'asc' },
      }),
  });
  const [error, setError] = useState<string | null>(null);
  if (current === undefined) {
    return (
      <button
        onClick={() => {
          const result = sdk.stageAggregateSessionCommand({
            session: gameSession,
            contractName: 'createGame',
            payload: { id },
          });
          if (result._tag === 'Failure') setError(result.failure.message);
        }}
      >
        Start game{error ? ` — ${error}` : ''}
      </button>
    );
  }
  const gameOutcome = outcome(current.board);
  const gameTurn = turn(current.board);
  return (
    <>
      <h2 aria-live="polite">
        {current.computerMoveFailure !== null
          ? 'O could not choose a move. Start a new game.'
          : gameOutcome === 'playing'
            ? gameTurn === 'X'
              ? 'Your turn'
              : 'O is thinking…'
            : gameOutcome === 'draw'
              ? 'A draw!'
              : `${gameOutcome} wins!`}
      </h2>
      <div className="board" aria-label="Tic-Tac-Toe board">
        {[...current.board].map((mark, square) => (
          <button
            key={square}
            aria-label={`Square ${square + 1}: ${mark === '.' ? 'empty' : mark}`}
            disabled={mark !== '.' || gameTurn !== 'X'}
            onClick={() => {
              const result = sdk.stageAggregateSessionCommand({
                session: gameSession,
                contractName: 'playX',
                payload: { id, board: current.board, square },
              });
              setError(
                result._tag === 'Failure' ? result.failure.message : null,
              );
            }}
          >
            {mark === '.' ? '' : mark}
          </button>
        ))}
      </div>
      {current.computerMoveFailure !== null ? (
        <p role="alert">{current.computerMoveFailure}</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="game-actions">
        <button
          onClick={() => {
            const result = sdk.stageAggregateSessionCommand({
              session: gameSession,
              contractName: 'savePosition',
              payload: {
                gameId: current.id,
                positionId: sdk.prefixId(savedPositionV2, crypto.randomUUID()),
              },
            });
            setError(result._tag === 'Failure' ? result.failure.message : null);
          }}
        >
          Save position
        </button>
        <button
          onClick={() => {
            localStorage.removeItem('tic-tac-toe-game');
            window.location.reload();
          }}
        >
          New game
        </button>
      </div>
      <section
        className="saved-positions"
        aria-labelledby="saved-positions-title"
      >
        <h2 id="saved-positions-title">Saved positions</h2>
        {savedPositions === undefined ? (
          <p>Loading saved positions…</p>
        ) : savedPositions.length === 0 ? (
          <p>No saved positions yet.</p>
        ) : (
          <div className="saved-positions-list">
            {savedPositions.map(position => (
              <article className="saved-position" key={position.id}>
                <div
                  className="board saved-board"
                  role="img"
                  aria-label={`Saved board: ${[...position.content.board]
                    .map(mark => (mark === '.' ? 'empty' : mark))
                    .join(', ')}`}
                >
                  {[...position.content.board].map((mark, square) => (
                    <span key={square} aria-hidden="true">
                      {mark === '.' ? '' : mark}
                    </span>
                  ))}
                </div>
                <p>
                  {position.content.turn === null
                    ? 'Finished'
                    : `${position.content.turn} to move`}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
