import type { EffectFactory, EffectName } from '../types';
import { confetti } from './confetti';
import { fireworks } from './fireworks';
import { leaves, sakura } from './leaves';
import { rain, storm } from './rain';
import { snow } from './snow';

const registry = new Map<string, EffectFactory>([
  ['snow', snow],
  ['rain', rain],
  ['storm', storm],
  ['thunderstorm', storm],
  ['fireworks', fireworks],
  // Aliases so festival names work out of the box.
  ['rockets', fireworks],
  ['diwali', fireworks],
  ['deepawali', fireworks],
  ['tihar', fireworks],
  ['confetti', confetti],
  ['leaves', leaves],
  ['autumn', leaves],
  ['sakura', sakura],
  ['petals', sakura],
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

export { confetti, fireworks, leaves, rain, sakura, snow, storm };
