import packageJson from '../package.json' with { type: 'json' };

// Package metadata remains the authoritative release version.
export const ZEROSPIN_SDK_VERSION = packageJson.version;
