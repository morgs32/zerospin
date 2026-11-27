/** The panel's own color-scheme resolves both palettes, including in its popup. */
export const devtoolsColors = {
  '--zs-devtools-surface': 'light-dark(#ffffff, #111318)',
  '--zs-devtools-surface-muted': 'light-dark(#f2f4f7, #1b2029)',
  '--zs-devtools-hover': 'light-dark(#e9ecf1, #272d39)',
  '--zs-devtools-selected': 'light-dark(#dbeafe, #203755)',
  '--zs-devtools-text': 'light-dark(#111827, #f2f4f7)',
  '--zs-devtools-muted': 'light-dark(#475467, #b8c1d0)',
  '--zs-devtools-border': 'light-dark(#d0d5dd, #394353)',
  '--zs-devtools-control-border': 'light-dark(#667085, #8795ab)',
  '--zs-devtools-accent': 'light-dark(#1d4ed8, #99bfff)',
  '--zs-devtools-success': 'light-dark(#166534, #86e3ad)',
  '--zs-devtools-warning': 'light-dark(#92400e, #f8cc84)',
  '--zs-devtools-danger': 'light-dark(#b42318, #ffa4a0)',
  '--zs-devtools-identity': 'light-dark(#7e22ce, #d8b4fe)',
  '--zs-devtools-warning-surface': 'light-dark(#fff5e6, #392c19)',
  '--zs-devtools-shadow': 'light-dark(rgb(0 0 0 / 12%), rgb(0 0 0 / 45%))',
  accentColor: 'var(--zs-devtools-accent)',
};

export const devtoolsStyles = `
.zerospin-devtools table {
  color: var(--zs-devtools-text);
}
.zerospin-devtools :focus-visible {
  outline: 2px solid var(--zs-devtools-accent);
  outline-offset: -2px;
}
`;
