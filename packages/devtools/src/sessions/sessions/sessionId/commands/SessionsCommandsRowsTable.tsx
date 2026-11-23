import { memo, useMemo, useState } from 'react';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { serviceSessionRepoDbConfig } from '@zerospin/core/serviceSession/serviceSessionRepoTables';

import type {
  IDevtoolsAggregateSessionEntry,
  IDevtoolsServiceSessionEntry,
} from '../../../../types';
import { useLiveQueryOnDb } from '../../../../useLiveQueryOnDb';
import { SessionsDataCell } from '../../../SessionsDataCell';
import { sessionsDatabaseTabStyles } from '../database/sessionsDatabaseTabStyles';

import { SessionsCommandsColumnPicker } from './SessionsCommandsColumnPicker';
import {
  formatCommandCellValue,
  isSessionsCommandsCopyCellColumn,
  makeSessionsCommandsTableColumns,
  truncateCommandDisplayText,
} from './sessionsCommandsTableColumns';

export const SessionsCommandsTableBody = memo(
  function SessionsCommandsTableBody(props: {
    rows: Readonly<Record<string, unknown>>[];
    service?: boolean;
  }) {
    // TanStack Table exposes mutable methods that React Compiler cannot memoize.
    'use no memo';
    const { rows, service = false } = props;
    const columns = useMemo(
      () => makeSessionsCommandsTableColumns(service),
      [service],
    );
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
      {},
    );

    // oxlint-disable-next-line react/incompatible-library -- This component explicitly opts out of React Compiler so TanStack's mutable table methods remain unmemoized.
    const table = useReactTable({
      columns,
      data: rows,
      defaultColumn: {
        maxSize: 320,
        minSize: 60,
        size: 120,
      },
      getCoreRowModel: getCoreRowModel(),
      getRowId: row => String(row.sessionIndex),
      onColumnVisibilityChange: setColumnVisibility,
      state: {
        columnVisibility,
      },
    });

    return (
      <div style={sessionsDatabaseTabStyles.tableScroll}>
        <div style={sessionsDatabaseTabStyles.tableToolbar}>
          <SessionsCommandsColumnPicker table={table} />
        </div>
        <table
          style={{
            ...sessionsDatabaseTabStyles.tableFixed,
            width: table.getTotalSize(),
          }}
        >
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      ...sessionsDatabaseTabStyles.tableThSticky,
                      width: header.getSize(),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => {
                  const fullText = formatCommandCellValue(cell.getValue());
                  const displayText = truncateCommandDisplayText(fullText);
                  const tdStyle = {
                    ...sessionsDatabaseTabStyles.tableTdEllipsis,
                    width: cell.column.getSize(),
                  };

                  if (isSessionsCommandsCopyCellColumn(cell.column.id)) {
                    return (
                      <SessionsDataCell
                        key={cell.id}
                        ariaLabel={`Copy ${cell.column.id}`}
                        tdStyle={tdStyle}
                        text={fullText}
                      />
                    );
                  }

                  return (
                    <td key={cell.id} style={tdStyle} title={fullText}>
                      {displayText}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
);

function LocalCommandsRowsTable(props: {
  readonly session: IDevtoolsAggregateSessionEntry;
}) {
  const { session } = props;
  const db = session.getCommandDb();
  if (db === null) throw new Error('Aggregate session is not initialized');
  const { data: rows, error } = useLiveQueryOnDb({
    db,
    deps: [],
    query: db =>
      db
        .select()
        .from(aggregateSessionRepoDbConfig.schema.commands)
        .orderBy(aggregateSessionRepoDbConfig.schema.commands.sessionIndex)
        .$dynamic(),
  });

  if (error !== undefined) {
    return (
      <p style={sessionsDatabaseTabStyles.errorText}>
        Failed to load rows: {error.message}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '0.85rem', padding: 8 }}>No rows.</p>
    );
  }

  return <SessionsCommandsTableBody rows={rows} />;
}

export function SessionsCommandsRowsTable(props: {
  readonly session: IDevtoolsAggregateSessionEntry;
}) {
  const { session } = props;
  return <LocalCommandsRowsTable session={session} />;
}

export function ServiceCommandsRowsTable(props: {
  readonly session: IDevtoolsServiceSessionEntry;
}) {
  const { session } = props;
  const db = session.getCommandDb();
  if (db === null) throw new Error('Service session is not initialized');
  const { data: rows, error } = useLiveQueryOnDb({
    db,
    deps: [],
    query: db =>
      db
        .select()
        .from(serviceSessionRepoDbConfig.schema.commands)
        .orderBy(serviceSessionRepoDbConfig.schema.commands.sessionIndex)
        .$dynamic(),
  });
  if (error !== undefined) {
    return (
      <p style={sessionsDatabaseTabStyles.errorText}>
        Failed to load rows: {error.message}
      </p>
    );
  }
  return <SessionsCommandsTableBody rows={rows} service />;
}
