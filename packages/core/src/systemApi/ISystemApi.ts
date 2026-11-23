import type { makeSystemApi } from '../utils/getSystemApi/makeSystemApi.ts';

/** Typed administrative methods shared by HTTP and native acquisition. */
export type ISystemApi = ReturnType<typeof makeSystemApi>;
