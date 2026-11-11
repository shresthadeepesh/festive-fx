import type { EffectFactory, EffectName } from '../types';
import { confetti } from './confetti';
import { fireworks } from './fireworks';
import { diyas } from './diyas';
import { fireflies } from './fireflies';
import { holi } from './holi';
import { kites } from './kites';
import { marigold } from './marigold';
import { stars } from './stars';
import { laliGurans, leaves, sakura } from './leaves';
import { laxmiPaila } from './laxmi-paila';
import { rangoli } from './rangoli';
import { prayerFlags } from './prayer-flags';
import { fog } from './fog';
import { hail } from './hail';
import { christmas } from './christmas';
import { newyear } from './newyear';
import { eid } from './eid';
import { lunarNewYear } from './lunar-new-year';
import { coins } from './coins';
import { teej } from './teej';
import { chhath } from './chhath';
import { hearts } from './hearts';
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
  ['diyas', diyas],
  ['lanterns', diyas],
  ['lights', diyas],
  ['stars', stars],
  ['night', stars],
  ['fireflies', fireflies],
  ['marigold', marigold],
  ['sayapatri', marigold],
  ['garland', marigold],
  ['holi', holi],
  ['gulal', holi],
  ['kites', kites],
  ['changa', kites],
  ['dashain', kites],
  // Nepal
  ['laxmi-paila', laxmiPaila],
  ['paila', laxmiPaila],
  ['footprints', laxmiPaila],
  ['rangoli', rangoli],
  ['mandala', rangoli],
  ['kolam', rangoli],
  ['prayer-flags', prayerFlags],
  ['lungta', prayerFlags],
  ['losar', prayerFlags],
  ['lali-gurans', laliGurans],
  ['laligurans', laliGurans],
  ['rhododendron', laliGurans],
  ['coins', coins],
  ['dhanteras', coins],
  ['teej', teej],
  ['bangles', teej],
  ['chhath', chhath],
  ['chhath-puja', chhath],
  // Other festivals
  ['christmas', christmas],
  ['xmas', christmas],
  ['fairy-lights', christmas],
  ['newyear', newyear],
  ['new-year', newyear],
  ['countdown', newyear],
  ['eid', eid],
  ['ramadan', eid],
  ['fanoos', eid],
  ['lunar-new-year', lunarNewYear],
  ['chinese-new-year', lunarNewYear],
  ['spring-festival', lunarNewYear],
  ['hearts', hearts],
  ['valentine', hearts],
  // Nature
  ['fog', fog],
  ['mist', fog],
  ['hail', hail],
  ['hailstorm', hail],
  // UI moments
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

export {
  chhath,
  christmas,
  coins,
  confetti,
  diyas,
  eid,
  fireflies,
  fireworks,
  fog,
  hail,
  hearts,
  holi,
  kites,
  laliGurans,
  laxmiPaila,
  leaves,
  lunarNewYear,
  marigold,
  newyear,
  prayerFlags,
  rain,
  rangoli,
  sakura,
  snow,
  stars,
  storm,
  teej,
};
