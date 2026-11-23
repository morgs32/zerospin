import { createStore } from 'zustand/vanilla';

export type ICommandCell = { text: string; blurred: boolean };
export type ICommandRow = { id: number; cells: readonly ICommandCell[] };
export type ICommandChainUpdate = {
  prepend?: ICommandRow;
  cellUpdates?: readonly {
    rowId: number;
    column: number;
    cell: Partial<ICommandCell>;
  }[];
};
export type ICommandChainHandle = {
  apply: (update: ICommandChainUpdate) => void;
  reset: () => void;
};

type IState = ICommandChainHandle & {
  rows: readonly ICommandRow[];
  enteringRowId: number | null;
};

export function createCommandChainStore(
  initialRows: readonly ICommandRow[],
  maxRows = 24,
) {
  const seed = initialRows.slice(0, maxRows).map(row => ({
    ...row,
    cells: row.cells.map(cell => ({ ...cell })),
  }));
  return createStore<IState>(set => ({
    rows: seed,
    enteringRowId: null,
    apply: ({ prepend, cellUpdates = [] }) =>
      set(state => {
        const rows = prepend
          ? [prepend, ...state.rows.filter(row => row.id !== prepend.id)].slice(
              0,
              maxRows,
            )
          : state.rows;
        return {
          rows: rows.map(row => ({
            ...row,
            cells: row.cells.map((cell, column) =>
              cellUpdates
                .filter(
                  update => update.rowId === row.id && update.column === column,
                )
                .reduce(
                  (value, update) => ({ ...value, ...update.cell }),
                  cell,
                ),
            ),
          })),
          enteringRowId: prepend ? prepend.id : state.enteringRowId,
        };
      }),
    reset: () => set({ rows: seed, enteringRowId: null }),
  }));
}
