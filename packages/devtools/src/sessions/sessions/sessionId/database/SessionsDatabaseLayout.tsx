import { useState } from 'react';

import { Outlet, useNavigate, useParams } from 'react-router';

import { useAggregateSession, useServiceSession } from '../useSession';

import { sessionsDatabaseTabStyles } from './sessionsDatabaseTabStyles';

export function SessionsDatabaseLayout() {
  const aggregateSession = useAggregateSession();
  const serviceSession = useServiceSession();
  const { sessionId, modelName } = useParams();
  const navigate = useNavigate();
  let decodedSelected = modelName ?? null;
  if (modelName !== undefined) {
    try {
      decodedSelected = decodeURIComponent(modelName);
    } catch {
      // Malformed URI segments are literal model keys.
    }
  }
  const [hoveredModelName, setHoveredModelName] = useState<string | null>(null);

  if (
    (aggregateSession === undefined && serviceSession === undefined) ||
    sessionId === undefined
  ) {
    return null;
  }

  const modelNames =
    aggregateSession?.sessionDefinition.modelNames ??
    serviceSession?.modelNames;

  if (modelNames === undefined) {
    return null;
  }

  if (modelNames.length === 0) {
    return (
      <div style={sessionsDatabaseTabStyles.dbEmptyState}>
        No models on definition
      </div>
    );
  }

  return (
    <div style={sessionsDatabaseTabStyles.dbRoot}>
      <aside style={sessionsDatabaseTabStyles.dbAside}>
        <div style={sessionsDatabaseTabStyles.dbList}>
          {modelNames.map(name => {
            const isSelected = decodedSelected === name;
            const isHovered = name === hoveredModelName;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  void navigate(
                    `/sessions/${sessionId}/database/${encodeURIComponent(name)}`,
                  );
                }}
                onMouseEnter={() => setHoveredModelName(name)}
                onMouseLeave={() => setHoveredModelName(null)}
                style={{
                  ...sessionsDatabaseTabStyles.dbRow,
                  backgroundColor: isSelected
                    ? 'var(--zs-devtools-selected)'
                    : isHovered
                      ? 'var(--zs-devtools-hover)'
                      : 'transparent',
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </aside>
      <div style={sessionsDatabaseTabStyles.dbDetail}>
        <Outlet />
      </div>
    </div>
  );
}
