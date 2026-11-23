/** Authored keys, excluding broad index signatures used for runtime lookup. */
export type IDeclaredKeys<RECORD> = keyof {
  [KEY in keyof RECORD as string extends KEY
    ? never
    : number extends KEY
      ? never
      : KEY]: RECORD[KEY];
};
