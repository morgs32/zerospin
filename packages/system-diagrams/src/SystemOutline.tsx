import type { IDeclarationBoard } from './makeDeclarationBoard.js';

export function SystemOutline({
  systemName,
  board,
  activeSectionId,
  navigation,
}: {
  systemName: string;
  board: IDeclarationBoard;
  activeSectionId?: string | undefined;
  navigation: { basePath: string };
}) {
  const groups = [
    { title: 'Aggregates', path: 'aggregates', sections: board.aggregates },
    { title: 'Services', path: 'services', sections: board.services },
  ];
  return (
    <aside className="system-board-sidebar">
      <nav className="system-board-outline" aria-label="System outline">
        <h1 className="system-board-outline-title">{systemName}</h1>
        <ol className="system-board-outline-groups">
          {groups.map(group => (
            <li key={group.title}>
              <h2>{group.title}</h2>
              {group.sections.length > 0 ? (
                <ol className="system-board-outline-items">
                  {group.sections.map(section => (
                    <li key={section.id}>
                      <a
                        className="system-board-outline-link truncate"
                        title={section.name}
                        href={`${navigation.basePath}/${group.path}/${encodeURIComponent(section.name)}`}
                        aria-current={
                          section.id === activeSectionId ? 'page' : undefined
                        }
                      >
                        {section.name}
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="system-board-empty">None declared.</p>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
