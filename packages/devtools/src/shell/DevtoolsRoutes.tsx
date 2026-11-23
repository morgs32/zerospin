import { Navigate, Route, Routes } from 'react-router';

import { SessionsCommandsLayout } from '../sessions/sessions/sessionId/commands/SessionsCommandsLayout.js';
import { SessionsDatabaseIndexRoute } from '../sessions/sessions/sessionId/database/SessionsDatabaseIndexRoute.js';
import { SessionsDatabaseLayout } from '../sessions/sessions/sessionId/database/SessionsDatabaseLayout.js';
import { SessionsDatabaseModelRoute } from '../sessions/sessions/sessionId/database/SessionsDatabaseModelRoute.js';
import { SessionsLogsRoute } from '../sessions/sessions/sessionId/logs/SessionsLogsRoute.js';
import { SessionIndexRoute } from '../sessions/sessions/sessionId/SessionIndexRoute.js';
import { SessionLayout } from '../sessions/sessions/sessionId/SessionLayout.js';
import {
  SessionPane,
  SessionStateRoute,
} from '../sessions/sessions/sessionId/SessionPane.js';
import { SessionsDetailEmpty } from '../sessions/sessions/SessionsDetailEmpty.js';
import { SessionsLayout } from '../sessions/sessions/SessionsLayout.js';
import { SettingsRoute } from '../SettingsRoute.js';
import type { IZerospinDevtoolsConfig } from '../types.js';

import { DevtoolsNavigation } from './DevtoolsNavigation.js';
export function DevtoolsRoutes(props: {
  configuredTheme?: IZerospinDevtoolsConfig['theme'];
  isDetached: boolean;
  onClose: () => void;
  onDetach: () => void;
}) {
  const { configuredTheme, isDetached, onClose, onDetach } = props;

  return (
    <Routes>
      <Route
        element={
          <DevtoolsNavigation
            isDetached={isDetached}
            onClose={onClose}
            onDetach={onDetach}
          />
        }
      >
        <Route path="/sessions" element={<SessionsLayout />}>
          <Route index element={<SessionsDetailEmpty />} />
          <Route path=":sessionId" element={<SessionLayout />}>
            <Route index element={<SessionIndexRoute />} />
            <Route element={<SessionPane />}>
              <Route path="state" element={<SessionStateRoute />} />
              <Route path="commands" element={<SessionsCommandsLayout />} />
              <Route path="database" element={<SessionsDatabaseLayout />}>
                <Route index element={<SessionsDatabaseIndexRoute />} />
                <Route
                  path=":modelName"
                  element={<SessionsDatabaseModelRoute />}
                />
              </Route>
              <Route path="logs" element={<SessionsLogsRoute />} />
            </Route>
          </Route>
        </Route>

        <Route
          path="/settings"
          element={<SettingsRoute configuredTheme={configuredTheme} />}
        />
        <Route path="*" element={<Navigate to="/sessions" replace />} />
      </Route>
    </Routes>
  );
}
