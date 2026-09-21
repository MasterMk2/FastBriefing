import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { createKneeboardMizCopy, createKneeboardPngZip, numberedKneeboardImages } from './kneeboardArchive';
import { parseMissionArchive } from '../workers/missionParser';

describe('kneeboard archives', () => {
  const images = numberedKneeboardImages([strToU8('png-one'), strToU8('png-two')]);

  it('numbers a standalone PNG set in a ZIP', () => {
    const entries = unzipSync(createKneeboardPngZip(images));
    expect(Object.keys(entries).sort()).toEqual(['FB-001.png', 'FB-002.png']);
    expect(entries['FB-001.png']).toEqual(strToU8('png-one'));
  });

  it('preserves source entry bytes and existing images in a common .miz copy', () => {
    const mission = strToU8('mission = { theatre = "Caucasus" }');
    const originalImage = strToU8('original image');
    const original = zipSync({
      mission,
      options: strToU8('options = {}'),
      'KNEEBOARD/IMAGES/FB-001.png': originalImage,
    });
    const copy = unzipSync(createKneeboardMizCopy(original, images, null));
    expect(copy.mission).toEqual(mission);
    expect(copy.options).toEqual(strToU8('options = {}'));
    expect(copy['KNEEBOARD/IMAGES/FB-001.png']).toEqual(originalImage);
    expect(copy['KNEEBOARD/IMAGES/FB-001-2.png']).toEqual(strToU8('png-one'));
    expect(copy['KNEEBOARD/IMAGES/FB-002-2.png']).toEqual(strToU8('png-two'));
    expect(unzipSync(original)['KNEEBOARD/IMAGES/FB-001.png']).toEqual(originalImage);
  });

  it('places type-specific pages under the aircraft folder', () => {
    const original = zipSync({ mission: strToU8('mission = {}') });
    const copy = unzipSync(createKneeboardMizCopy(original, images, 'FA-18C_hornet'));
    expect(copy['KNEEBOARD/FA-18C_hornet/IMAGES/FB-001.png']).toEqual(strToU8('png-one'));
    expect(() => createKneeboardMizCopy(original, images, '../other')).toThrow();
  });

  it('keeps the generated .miz readable by the mission parser', async () => {
    const original = zipSync({
      mission: strToU8('mission = { ["date"] = { ["Year"] = 2026, ["Month"] = 9, ["Day"] = 21 } }'),
      theatre: strToU8('Caucasus'),
    });
    const parsed = await parseMissionArchive(createKneeboardMizCopy(original, images, null));
    expect(parsed.theatre).toBe('Caucasus');
    expect(parsed.kneeboardFiles.size).toBe(2);
  });
});
