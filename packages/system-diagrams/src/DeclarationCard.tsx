import { useState } from 'react';

import { Tabs } from '@base-ui/react/tabs';

import { FieldTable } from './FieldTable.js';
import type { IDeclarationCard } from './makeDeclarationBoard.js';
import { StudioCard } from './StudioCard.js';

export interface IDeclarationCardView {
  selectedVersion?: number | undefined;
  href: (version: number) => string;
  onNavigate?: ((version: number) => void) | undefined;
}

export function DeclarationCard(props: {
  card: IDeclarationCard;
  view?: IDeclarationCardView | undefined;
}) {
  const { card, view } = props;
  const isActorOrAgent = card.type === 'actor' || card.type === 'agent';
  const initialVersion =
    (isActorOrAgent ? card.versions.at(-1) : card.versions[0]) ?? null;
  const focusedVersion = view?.selectedVersion;
  const [tab, setTab] = useState({
    focusedVersion,
    version: focusedVersion ?? initialVersion,
  });
  let activeVersion = tab.version;
  if (
    tab.focusedVersion !== focusedVersion ||
    (tab.version !== null && !card.versions.includes(tab.version))
  ) {
    activeVersion = focusedVersion ?? initialVersion;
    setTab({ focusedVersion, version: activeVersion });
  }

  return (
    <StudioCard
      className="system-board-card"
      data-selected={focusedVersion !== undefined ? true : undefined}
    >
      <Tabs.Root
        className="system-board-version-tabs"
        value={activeVersion}
        onValueChange={version => setTab({ focusedVersion, version })}
      >
        <div className="system-board-card-content">
          <strong>{card.name}</strong>
          {card.versions.length > 0 && (
            <Tabs.List
              className="system-board-versions"
              aria-label={`${card.name} versions`}
            >
              {card.versions.map(version => (
                <Tabs.Tab
                  className="system-board-version-tab"
                  key={version}
                  value={version}
                  aria-label={`${card.name} v${version}`}
                >
                  v{version}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          )}
          {view && isActorOrAgent && activeVersion !== null && (
            <a
              className="system-board-card-view"
              href={view.href(activeVersion)}
              aria-label={`View ${card.name} v${activeVersion}`}
              aria-current={
                focusedVersion === activeVersion ? 'true' : undefined
              }
              onClick={event => {
                if (
                  !view.onNavigate ||
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
                view.onNavigate(activeVersion);
              }}
            >
              View →
            </a>
          )}
        </div>
        {card.versions.map(version => {
          const model = card.models?.find(model => model.version === version);
          const contract = card.contracts?.find(
            contract => contract.version === version,
          );
          const properties = model?.propertiesShape ?? contract?.payloadShape;
          const label = contract ? 'payload' : 'fields';

          return (
            <Tabs.Panel
              className="system-board-field-section"
              key={version}
              value={version}
            >
              {properties && (
                <FieldTable
                  properties={properties}
                  label={`${card.name} v${version} ${label}`}
                />
              )}
            </Tabs.Panel>
          );
        })}
      </Tabs.Root>
    </StudioCard>
  );
}
