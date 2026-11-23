import type { ReactNode } from 'react';

import { Group, Panel, Separator } from 'react-resizable-panels';

export function SystemBoardLayout({
  outline,
  children,
}: {
  outline: ReactNode;
  children: ReactNode;
}) {
  return (
    <Group className="system-board-layout" orientation="horizontal">
      <Panel
        id="outline"
        defaultSize="220px"
        minSize="180px"
        maxSize="50%"
        groupResizeBehavior="preserve-pixel-size"
      >
        {outline}
      </Panel>
      <Separator
        className="system-board-resize-handle"
        aria-label="Resize system outline"
      />
      <Panel id="content" minSize="160px">
        {children}
      </Panel>
    </Group>
  );
}
