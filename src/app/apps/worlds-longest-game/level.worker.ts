/// <reference lib="webworker" />
import { generateLevel } from './generator';
import type { LevelRequest, LevelResponse } from './level-source';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<LevelRequest>) => {
  const { id, number, seed } = event.data;
  ctx.postMessage({ id, def: generateLevel(number, seed) } satisfies LevelResponse);
};
