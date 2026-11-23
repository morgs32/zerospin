import { useId } from 'react';

import {
  DeclarationCard,
  type IDeclarationCardView,
} from './DeclarationCard.js';
import type {
  IDeclarationCard,
  IDeclarationType,
} from './makeDeclarationBoard.js';

const columns: { type: IDeclarationType; title: string; icon: string }[] = [
  {
    type: 'actor',
    title: 'Actors',
    icon: 'M16 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  },
  {
    type: 'agent',
    title: 'Agents',
    icon: 'M12 3v3 M5 7h14v13H5z M9 12h.01 M15 12h.01 M9 16h6 M2 11v5 M22 11v5',
  },
  {
    type: 'model',
    title: 'Models',
    icon: 'M4 5c0-4 16-4 16 0s-16 4-16 0 M4 5v14c0 4 16 4 16 0V5 M4 12c0 4 16 4 16 0',
  },
  {
    type: 'contract',
    title: 'Contracts',
    icon: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5',
  },
];

export function DeclarationColumn(props: {
  type: IDeclarationType;
  declarations: IDeclarationCard[];
  getCardView?:
    | ((card: IDeclarationCard) => IDeclarationCardView | undefined)
    | undefined;
}) {
  const { type, declarations, getCardView } = props;
  const headingId = useId();
  const column = columns.find(column => column.type === type);
  if (!column) return null;
  return (
    <section className="system-board-column" aria-labelledby={headingId}>
      <h3 id={headingId}>
        <span className="system-board-column-title">
          <span
            className={`system-board-icon system-board-icon-${type}`}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={column.icon} />
            </svg>
          </span>
          {column.title}
        </span>
      </h3>
      <section
        className="system-board-cards"
        aria-label={`${column.title} declarations`}
        // Keyboard focus lets users scroll this independently overflowing region.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        {declarations.length > 0 ? (
          declarations.map(card => (
            <DeclarationCard
              key={card.id}
              card={card}
              view={getCardView?.(card)}
            />
          ))
        ) : (
          <p className="system-board-empty">None declared.</p>
        )}
      </section>
    </section>
  );
}
