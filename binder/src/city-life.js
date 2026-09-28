export const BUILDING_LIGHT_COLORS = [0xa4d9e4,0xffc48c,0x9bcbd4,0xd5e8ee,0xf2b783,0xb8d9c2,0xa8d1db,0xc9c0dc,0xe5e7df,0xe4b7a5,0xb4d4e5,0xecc6a0];
export const WINDOW_FADE_SECONDS = 1.4;
export const STREET_SCREEN_BUILDINGS=['street-left-white','near-east-sign-building'];

export function citySeed(id) {
  let hash=2166136261;
  for(const character of id)hash=Math.imul(hash^character.charCodeAt(0),16777619)>>>0;
  return hash;
}

export function cityIdentity(id) {
  const hash=citySeed(id);
  return {
    lightColor:BUILDING_LIGHT_COLORS[hash%BUILDING_LIGHT_COLORS.length],
    windowPeriod:24+(hash%4900)/100,
    windowPhase:((hash>>>9)%10000)/100,
  };
}
