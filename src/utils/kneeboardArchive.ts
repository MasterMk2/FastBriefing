import { unzipSync, zipSync } from 'fflate';

export interface KneeboardImage {
  name: string;
  data: Uint8Array;
}

export function numberedKneeboardImages(pngs: Uint8Array[]): KneeboardImage[] {
  return pngs.map((data, index) => ({
    name: `FB-${String(index + 1).padStart(3, '0')}.png`,
    data,
  }));
}

export function createKneeboardPngZip(images: KneeboardImage[]): Uint8Array {
  return zipSync(Object.fromEntries(images.map(image => [image.name, image.data])), { level: 0 });
}

export function createKneeboardMizCopy(
  source: Uint8Array,
  images: KneeboardImage[],
  aircraftType: string | null,
): Uint8Array {
  if (aircraftType && !/^[A-Za-z0-9_-]+$/.test(aircraftType)) {
    throw new Error('Invalid aircraft type for kneeboard path');
  }
  const entries = unzipSync(source);
  if (!Object.prototype.hasOwnProperty.call(entries, 'mission')) {
    throw new Error('Mission entry is missing');
  }
  const folder = aircraftType ? `KNEEBOARD/${aircraftType}/IMAGES/` : 'KNEEBOARD/IMAGES/';
  let block = 1;
  let names: string[];
  do {
    const suffix = block === 1 ? '' : `-${block}`;
    names = images.map(image => `${folder}${image.name.replace(/\.png$/, `${suffix}.png`)}`);
    block += 1;
  } while (names.some(name => Object.prototype.hasOwnProperty.call(entries, name)));
  images.forEach((image, index) => { entries[names[index]] = new Uint8Array(image.data); });
  return zipSync(entries, { level: 6 });
}
