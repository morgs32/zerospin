import { useEffect, useRef, useState } from 'react';

import type { Table } from '@tanstack/react-table';

import { sessionsDatabaseTabStyles } from '../database/sessionsDatabaseTabStyles';

export function SessionsCommandsColumnPicker(props: {
  readonly table: Table<Record<string, unknown>>;
}) {
  const { table } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const leafColumns = table.getAllLeafColumns();
  const visibleCount = leafColumns.filter(column =>
    column.getIsVisible(),
  ).length;
  const totalCount = leafColumns.length;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root === null || !root.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={sessionsDatabaseTabStyles.tableToolbarPopoverRoot}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        style={sessionsDatabaseTabStyles.tableToolbarButton}
        onClick={() => {
          setOpen(previous => !previous);
        }}
      >
        Columns ({visibleCount}/{totalCount})
      </button>
      {open ? (
        <fieldset
          aria-label="Table columns"
          style={{
            ...sessionsDatabaseTabStyles.tableToolbarPopoverPanel,
            margin: 0,
            border: 0,
            minWidth: 0,
          }}
        >
          {leafColumns.map(column => (
            <label
              key={column.id}
              style={sessionsDatabaseTabStyles.tableToolbarCheckbox}
            >
              <input
                checked={column.getIsVisible()}
                disabled={!column.getCanHide()}
                onChange={column.getToggleVisibilityHandler()}
                type="checkbox"
              />
              {column.id}
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
