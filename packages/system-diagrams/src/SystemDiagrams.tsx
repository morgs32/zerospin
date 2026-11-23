'use client';

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import type { ISystemSpec } from '@zerospin/core/system/types';

import { DeclarationColumn } from './DeclarationColumn.js';
import {
  makeDeclarationBoard,
  type IDeclarationType,
} from './makeDeclarationBoard.js';
import { SystemBoardLayout } from './SystemBoardLayout.js';
import { SystemOutline } from './SystemOutline.js';

export interface ISystemDiagramsProps {
  systemSpec: ISystemSpec;
  navigation: { sectionId: string | undefined; basePath: string };
}

interface IDeclarationSelection {
  type: 'actor' | 'agent';
  name: string;
  version: number;
}

function readDeclarationFilter(location: string) {
  const query = new URLSearchParams(location.split('#')[0]);
  const requested =
    query.has('actor') || query.has('agent') || query.has('version');
  const actors = query.getAll('actor');
  const agents = query.getAll('agent');
  const versions = query.getAll('version');
  const type =
    actors.length === 1 && agents.length === 0
      ? 'actor'
      : agents.length === 1 && actors.length === 0
        ? 'agent'
        : undefined;
  const name = type === 'actor' ? actors[0] : agents[0];
  const version = Number(versions[0]);
  const selection: IDeclarationSelection | undefined =
    type !== undefined &&
    name !== undefined &&
    name !== '' &&
    versions.length === 1 &&
    /^[1-9]\d*$/.test(versions[0] ?? '') &&
    Number.isSafeInteger(version)
      ? { type, name, version }
      : undefined;
  return { requested, selection };
}

function declarationHref(location: string, selection?: IDeclarationSelection) {
  const hashIndex = location.indexOf('#');
  const query = new URLSearchParams(
    hashIndex < 0 ? location : location.slice(0, hashIndex),
  );
  const hash = hashIndex < 0 ? '' : location.slice(hashIndex);
  query.delete('actor');
  query.delete('agent');
  query.delete('version');
  if (selection) {
    query.set(selection.type, selection.name);
    query.set('version', String(selection.version));
  }
  return `?${query.toString()}${hash}`;
}

function useDeclarationLocation() {
  const notify = useRef<() => void>(() => {});
  const subscribe = useCallback((onChange: () => void) => {
    notify.current = onChange;
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      notify.current = () => {};
    };
  }, []);
  const location = useSyncExternalStore(
    subscribe,
    () => window.location.search + window.location.hash,
    () => '',
  );
  const navigate = (href: string) => {
    const url = new URL(href, window.location.href);
    if (!url.search) url.search = '';
    if (url.href === window.location.href) return;
    window.history.pushState(window.history.state, '', url);
    notify.current();
  };
  return { location, navigate };
}

export function SystemDiagrams(props: ISystemDiagramsProps) {
  const { systemSpec, navigation } = props;
  const board = useMemo(() => makeDeclarationBoard(systemSpec), [systemSpec]);
  const { location, navigate } = useDeclarationLocation();
  const filter = readDeclarationFilter(location);
  const clearHref = declarationHref(location);
  const activeSectionId = navigation.sectionId;
  const outlineGroups = [
    {
      sectionLabel: 'Aggregate',
      sections: board.aggregates,
    },
    {
      sectionLabel: 'Service',
      sections: board.services,
    },
  ];
  return (
    <main className="system-diagrams">
      <SystemBoardLayout
        outline={
          <SystemOutline
            systemName={systemSpec.systemName}
            board={board}
            activeSectionId={activeSectionId}
            navigation={navigation}
          />
        }
      >
        <div className="system-board-content">
          {outlineGroups.flatMap(group =>
            group.sections
              .filter(section => section.id === activeSectionId)
              .map(section => {
                const selection = filter.selection;
                const selectedCard =
                  selection &&
                  section.declarations.find(
                    card =>
                      card.type === selection.type &&
                      card.name === selection.name,
                  );
                const scope = selectedCard?.scopes?.find(
                  scope => scope.version === selection?.version,
                );
                const visibleDeclarations = filter.requested
                  ? (scope?.declarations ?? [])
                  : section.declarations;
                return (
                  <section
                    className="system-board-owner"
                    id={section.id}
                    key={section.id}
                    aria-labelledby={`${section.id}-heading`}
                  >
                    <header className="system-board-owner-header">
                      <h2 id={`${section.id}-heading`}>{section.name}</h2>
                      {filter.requested && (
                        <output className="system-board-filter">
                          <span>
                            {scope && selection
                              ? `${selection.name} v${selection.version}`
                              : 'Selection unavailable'}
                          </span>
                          <a
                            className="system-board-filter-clear"
                            href={clearHref}
                            aria-label="Clear declaration filter"
                            onClick={event => {
                              if (
                                event.defaultPrevented ||
                                event.button !== 0 ||
                                event.metaKey ||
                                event.ctrlKey ||
                                event.shiftKey ||
                                event.altKey
                              ) {
                                return;
                              }
                              event.preventDefault();
                              navigate(clearHref);
                            }}
                          >
                            ×
                          </a>
                        </output>
                      )}
                    </header>
                    <div
                      className="system-board"
                      aria-label={`${group.sectionLabel} ${section.name} declarations`}
                    >
                      {(
                        [
                          'actor',
                          'agent',
                          'model',
                          'contract',
                        ] satisfies IDeclarationType[]
                      ).map(type => (
                        <DeclarationColumn
                          key={type}
                          type={type}
                          declarations={(type === 'actor' || type === 'agent'
                            ? section.declarations
                            : visibleDeclarations
                          ).filter(card => card.type === type)}
                          getCardView={card => {
                            if (
                              card.type !== 'actor' &&
                              card.type !== 'agent'
                            ) {
                              return undefined;
                            }
                            const cardType = card.type;
                            const href = (version: number) =>
                              declarationHref(location, {
                                type: cardType,
                                name: card.name,
                                version,
                              });
                            return {
                              selectedVersion:
                                scope &&
                                selection?.type === card.type &&
                                selection.name === card.name
                                  ? selection.version
                                  : undefined,
                              href,
                              onNavigate: version => navigate(href(version)),
                            };
                          }}
                        />
                      ))}
                    </div>
                  </section>
                );
              }),
          )}
          {board.aggregates.length === 0 && board.services.length === 0 && (
            <p className="system-board-empty">
              No aggregates or services declared.
            </p>
          )}
        </div>
      </SystemBoardLayout>
    </main>
  );
}
