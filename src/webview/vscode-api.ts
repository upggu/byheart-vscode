import type { WebviewMessage } from '../shared/protocol';

export interface WebviewApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): WebviewApi;
declare global {
  interface Window {
    /** Browser dev harness (dev/harness.js) stands in for the VS Code API. */
    __byheartHarness?: WebviewApi;
  }
}

function create(): WebviewApi {
  if (typeof acquireVsCodeApi === 'function') return acquireVsCodeApi();
  if (window.__byheartHarness) return window.__byheartHarness;
  let memory: unknown = null;
  return { postMessage: () => undefined, getState: () => memory, setState: (s) => { memory = s; } };
}

export const api: WebviewApi = create();
