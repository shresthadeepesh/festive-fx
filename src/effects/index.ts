import type { EffectFactory, EffectName } from '../types';
import { rain, storm } from './rain';
import { snow } from './snow';

const registry = new Map<string, EffectFactory>([
  ['snow', snow],
  ['rain', rain],
  ['storm', storm],
  ['thunderstorm', storm],
]);

/** Add (or replace) an effect so it can be used by name everywhere, including `<festive-fx effect="...">`. */
export function registerEffect(name: string, factory: EffectFactory): void {
  registry.set(name, factory);
}

export function getEffect(name: EffectName): EffectFactory | undefined {
  return registry.get(name);
}

export function listEffects(): string[] {
  return [...registry.keys()];
}

export { rain, snow, storm };
