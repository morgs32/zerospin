import { checkBrowserSessionAccess } from './checkBrowserSessionAccess.ts';

/** One identity-bound tab lease owns its provider, subscriptions and retained capability. */
export function makeNodeAttachment(props: {
  isCurrent(): boolean;
  onDetach(): void;
}) {
  const checkCurrent = props.isCurrent.bind(props);
  const { isCurrent, onDetach } = props;
  let detached = false;
  const releases: (() => void)[] = [];
  return {
    isCurrent,
    isDetached: () => detached,
    check: () =>
      checkBrowserSessionAccess({ isCurrent: checkCurrent(), detached }),
    own(release: () => void) {
      if (detached) release();
      else releases.push(release);
    },
    dispose() {
      if (detached) return;
      detached = true;
      let report = () => {};
      let failed = false;
      for (const release of [...releases.reverse(), onDetach]) {
        try {
          release();
        } catch (error) {
          if (!failed) {
            report = () => {
              throw error;
            };
            failed = true;
          }
        }
      }
      releases.length = 0;
      report();
    },
  };
}
