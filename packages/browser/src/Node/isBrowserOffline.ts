export const isBrowserOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;
