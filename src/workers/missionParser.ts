import { strFromU8, unzip, Unzip, UnzipInflate } from 'fflate';
import type { UnzipFileInfo } from 'fflate';
import { parse } from 'luaparse';

export const ZIP_LIMITS = {
  MAX_ARCHIVE_SIZE: 50 * 1024 * 1024,
  MAX_ENTRIES: 100,
  MAX_TOTAL_SIZE: 50 * 1024 * 1024,
  MAX_ENTRY_SIZE: 10 * 1024 * 1024,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,
  MAX_COMPRESSION_RATIO: 100,
} as const;

const ZIP_STREAM_CHUNK_SIZE = 64 * 1024;

export interface ParsedMissionFile {
  mission: unknown;
  theatre: string;
  warehouses: unknown;
  options: unknown;
  dictionary: Record<string, string>;
  mapResource: Record<string, string>;
  kneeboardFiles: Map<string, Uint8Array>;
  briefingImages: Map<string, Uint8Array>;
}

type ZipEntryMetadata = Pick<UnzipFileInfo, 'name' | 'size' | 'originalSize' | 'compression'>;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function zipError(message: string): Error {
  return new Error(`ZIPファイルを安全に展開できませんでした。${message}`);
}

function displayEntryName(name: string): string {
  // ZIPエントリ名に混入しうるASCII制御文字を表示用の「?」へ置換する意図的なマッチ。
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, '?');
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString('ja-JP')}バイト`;
}

const BRIEFING_IMAGE_PATTERN = /^l10n\/DEFAULT\/.*\.(?:png|jpe?g|gif|bmp)$/i;

function isBriefingImageEntry(name: string): boolean {
  return BRIEFING_IMAGE_PATTERN.test(name);
}

function entrySizeLimit(name: string): number {
  return isBriefingImageEntry(name) ? ZIP_LIMITS.MAX_IMAGE_SIZE : ZIP_LIMITS.MAX_ENTRY_SIZE;
}

function validateZipEntryMetadata(entry: {
  name: string;
  size?: number;
  originalSize?: number;
}, maxEntrySize = ZIP_LIMITS.MAX_ENTRY_SIZE): Error | null {
  const { name, size: compressedSize, originalSize } = entry;
  const shownName = `「${displayEntryName(name)}」`;

  if (originalSize !== undefined && (!Number.isFinite(originalSize) || originalSize < 0)) {
    return zipError(`エントリ${shownName}の展開後サイズが不正です。`);
  }
  if (compressedSize !== undefined && (!Number.isFinite(compressedSize) || compressedSize < 0)) {
    return zipError(`エントリ${shownName}の圧縮サイズが不正です。`);
  }
  if (originalSize !== undefined && originalSize > maxEntrySize) {
    return zipError(
      `エントリ${shownName}の展開後サイズ（${formatBytes(originalSize)}）が上限（${formatBytes(maxEntrySize)}）を超えています。`
    );
  }

  if (compressedSize !== undefined && originalSize !== undefined) {
    const compressionRatio = compressedSize === 0
      ? (originalSize === 0 ? 0 : Number.POSITIVE_INFINITY)
      : originalSize / compressedSize;
    if (compressionRatio > ZIP_LIMITS.MAX_COMPRESSION_RATIO) {
      return zipError(
        `エントリ${shownName}の展開後サイズと圧縮サイズの比率（${compressionRatio.toFixed(1)}倍）が上限（${ZIP_LIMITS.MAX_COMPRESSION_RATIO}倍）を超えています。`
      );
    }
  }

  return null;
}

function inspectZip(data: Uint8Array): Promise<ZipEntryMetadata[]> {
  return new Promise((resolve, reject) => {
    const entries: ZipEntryMetadata[] = [];
    let entryCount = 0;
    let totalSize = 0;
    let validationError: Error | null = null;

    try {
      unzip(data, {
        filter: (entry) => {
          entryCount += 1;
          if (entryCount > ZIP_LIMITS.MAX_ENTRIES && !validationError) {
            validationError = zipError(
              `ZIP内のファイル数（${entryCount}件）が上限（${ZIP_LIMITS.MAX_ENTRIES}件）を超えています。`
            );
          }

          const entryError = validateZipEntryMetadata(entry, entrySizeLimit(entry.name));
          if (entryError && !validationError) {
            validationError = entryError;
          }

          if (entry.originalSize !== undefined) {
            totalSize += entry.originalSize;
            if (totalSize > ZIP_LIMITS.MAX_TOTAL_SIZE && !validationError) {
              validationError = zipError(
                `ZIP全体の展開後サイズ（${formatBytes(totalSize)}）が上限（${formatBytes(ZIP_LIMITS.MAX_TOTAL_SIZE)}）を超えています。`
              );
            }
          }

          if (entries.length < ZIP_LIMITS.MAX_ENTRIES) {
            entries.push(entry);
          }
          return false;
        },
      }, (error) => {
        if (error) {
          reject(zipError(`ZIPの構造を読み取れませんでした: ${asError(error).message}`));
        } else if (validationError) {
          reject(validationError);
        } else {
          resolve(entries);
        }
      });
    } catch (error) {
      reject(zipError(`ZIPの構造を読み取れませんでした: ${asError(error).message}`));
    }
  });
}

function concatenateChunks(chunks: Uint8Array[], totalSize: number): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0];

  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function extractZipEntries(
  data: Uint8Array,
  metadata: ZipEntryMetadata[],
  shouldExtract: (name: string) => boolean
): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    const files: Record<string, Uint8Array> = {};
    const metadataByName = new Map<string, ZipEntryMetadata[]>();
    let extractedEntryCount = 0;
    let extractedSize = 0;
    let offset = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    for (const entry of metadata) {
      const entriesForName = metadataByName.get(entry.name) ?? [];
      entriesForName.push(entry);
      metadataByName.set(entry.name, entriesForName);
    }
    const stream = new Unzip((file) => {
      extractedEntryCount += 1;
      if (extractedEntryCount > ZIP_LIMITS.MAX_ENTRIES) {
        throw zipError(`ZIP内のファイル数が上限（${ZIP_LIMITS.MAX_ENTRIES}件）を超えています。`);
      }

      const entriesForName = metadataByName.get(file.name);
      const declared = entriesForName?.shift();
      const entryError = validateZipEntryMetadata({
        name: file.name,
        size: file.size ?? declared?.size,
        originalSize: file.originalSize ?? declared?.originalSize,
      }, entrySizeLimit(file.name));
      if (entryError) throw entryError;
      if (!shouldExtract(file.name)) return;

      const chunks: Uint8Array[] = [];
      let entrySize = 0;
      const maxEntrySize = entrySizeLimit(file.name);
      file.ondata = (error, chunk, final) => {
        if (error) throw zipError(`エントリ「${displayEntryName(file.name)}」を展開できませんでした: ${asError(error).message}`);
        if (chunk && chunk.length > 0) {
          entrySize += chunk.length;
          extractedSize += chunk.length;
          if (entrySize > maxEntrySize) {
            throw zipError(
              `エントリ「${displayEntryName(file.name)}」の展開後サイズが上限（${formatBytes(maxEntrySize)}）を超えたため、展開を中断しました。`
            );
          }
          if (extractedSize > ZIP_LIMITS.MAX_TOTAL_SIZE) {
            throw zipError(
              `ZIP全体の展開後サイズが上限（${formatBytes(ZIP_LIMITS.MAX_TOTAL_SIZE)}）を超えたため、展開を中断しました。`
            );
          }
          chunks.push(chunk);
        }
        if (final) {
          const expectedSize = file.originalSize ?? declared?.originalSize;
          if (expectedSize !== undefined && entrySize !== expectedSize) {
            throw zipError(
              `エントリ「${displayEntryName(file.name)}」の展開サイズ（${formatBytes(entrySize)}）が宣言値と一致しません。`
            );
          }

          const compressedSize = file.size ?? declared?.size;
          if (compressedSize === undefined) {
            const compressionRatio = data.length === 0 ? 0 : entrySize / data.length;
            if (compressionRatio > ZIP_LIMITS.MAX_COMPRESSION_RATIO) {
              throw zipError(
                `エントリ「${displayEntryName(file.name)}」の圧縮率が上限（${ZIP_LIMITS.MAX_COMPRESSION_RATIO}倍）を超えています。`
              );
            }
          }
          files[file.name] = concatenateChunks(chunks, entrySize);
        }
      };
      file.start();
    });
    stream.register(UnzipInflate);

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      const normalized = asError(error);
      reject(normalized.message.startsWith('ZIPファイルを安全に') ? normalized : zipError(normalized.message));
    };

    const feed = () => {
      if (settled) return;
      const end = Math.min(offset + ZIP_STREAM_CHUNK_SIZE, data.length);
      const final = end === data.length;
      try {
        stream.push(data.subarray(offset, end), final);
      } catch (error) {
        fail(error);
        return;
      }

      offset = end;
      if (final) {
        settled = true;
        resolve(files);
      } else {
        timer = setTimeout(feed, 0);
      }
    };

    feed();
  });
}

export async function unzipWithLimits(
  data: Uint8Array,
  shouldExtract: (name: string) => boolean = () => true
): Promise<Record<string, Uint8Array>> {
  if (data.length > ZIP_LIMITS.MAX_ARCHIVE_SIZE) {
    throw zipError(
      `圧縮後のファイルサイズ（${formatBytes(data.length)}）が上限（${formatBytes(ZIP_LIMITS.MAX_ARCHIVE_SIZE)}）を超えています。`
    );
  }

  const metadata = await inspectZip(data);
  return extractZipEntries(data, metadata, shouldExtract);
}

export function parseLuaTable(luaCode: string): unknown {
  let ast: { type: string; body: unknown[] };
  try {
    ast = parse(luaCode, { encodingMode: 'pseudo-latin1' }) as unknown as { type: string; body: unknown[] };
  } catch (error) {
    console.error('Lua parse error:', error);
    throw new Error(`Luaファイルを解析できませんでした: ${asError(error).message}`);
  }

  if (ast.type === 'Chunk' && ast.body.length > 0) {
    const firstStat = ast.body[0] as unknown as Record<string, unknown>;
    if (firstStat.type === 'AssignmentStatement' || firstStat.type === 'LocalStatement') {
      const initializers = firstStat.init;
      const initializer = Array.isArray(initializers) ? initializers[0] : initializers;
      if (initializer !== undefined) return convertLuaNode(initializer);
    }
  }

  throw new Error('Luaテーブルが見つかりません。');
}

export function convertLuaNode(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((value) => convertLuaNode(value));

  const n = node as Record<string, unknown>;

  switch (n.type) {
    case 'TableConstructorExpression': {
      const fields = Array.isArray(n.fields) ? n.fields : [];
      if (fields.every((field) => (field as Record<string, unknown>).type === 'TableValue')) {
        return fields.map((field) => convertLuaNode((field as Record<string, unknown>).value));
      }

      const numericKeys = fields.map((field) => {
        const f = field as Record<string, unknown>;
        if (f.type !== 'TableKey') return undefined;
        const key = convertLuaNode(f.key);
        return typeof key === 'number' && Number.isInteger(key) && key > 0 ? key : undefined;
      });
      const isNumericKeyArray = fields.length > 0
        && numericKeys.every((key): key is number => key !== undefined)
        && new Set(numericKeys).size === numericKeys.length
        && [...numericKeys].sort((a, b) => a - b).every((key, index) => key === index + 1);

      if (isNumericKeyArray) {
        const values = new Array<unknown>(fields.length);
        for (let index = 0; index < fields.length; index += 1) {
          const field = fields[index] as Record<string, unknown>;
          values[numericKeys[index] - 1] = convertLuaNode(field.value);
        }
        return values;
      }

      const result: Record<string, unknown> = {};
      let implicitIndex = 1;
      for (const field of fields) {
        const f = field as Record<string, unknown>;
        if (f.type === 'TableKey') {
          const key = convertLuaNode(f.key);
          const value = convertLuaNode(f.value);
          if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean') {
            result[String(key)] = value;
          }
        } else if (f.type === 'TableKeyString') {
          const key = convertLuaNode(f.key);
          if (typeof key === 'string' || typeof key === 'number') {
            result[String(key)] = convertLuaNode(f.value);
          }
        } else if (f.type === 'TableValue') {
          result[String(implicitIndex)] = convertLuaNode(f.value);
          implicitIndex += 1;
        }
      }
      return result;
    }

    case 'UnaryExpression': {
      const argument = convertLuaNode(n.argument);
      if (n.operator === '-' && typeof argument === 'number') return -argument;
      if (n.operator === '+' && typeof argument === 'number') return argument;
      if (n.operator === 'not') return argument === null || argument === false;
      return n;
    }

    case 'NumericLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
      return n.value;

    case 'NilLiteral':
      return null;

    case 'Identifier':
      return n.name;

    default:
      console.warn('Unknown Lua node type:', n.type);
      return n;
  }
}

function parseStringTable(content: string): Record<string, string> {
  const parsed = parseLuaTable(content);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

export function parseDictionary(content: string): Record<string, string> {
  return parseStringTable(content);
}

export function parseMapResource(content: string): Record<string, string> {
  return parseStringTable(content);
}

export function shouldExtractEntry(name: string): boolean {
  return name === 'mission'
    || name === 'theatre'
    || name === 'warehouses'
    || name === 'options'
    || name === 'l10n/DEFAULT/dictionary'
    || name === 'l10n/DEFAULT/mapResource'
    || isBriefingImageEntry(name)
    || name.startsWith('KNEEBOARD/');
}

export async function parseMissionArchive(data: Uint8Array): Promise<ParsedMissionFile> {
  const zip = await unzipWithLimits(data, shouldExtractEntry);

  const result: ParsedMissionFile = {
    mission: null,
    theatre: '',
    warehouses: null,
    options: null,
    dictionary: {},
    mapResource: {},
    kneeboardFiles: new Map(),
    briefingImages: new Map(),
  };

  for (const name of Object.keys(zip)) {
    const entry = zip[name];

    if (name === 'mission') {
      result.mission = parseLuaTable(strFromU8(entry));
    } else if (name === 'theatre') {
      result.theatre = strFromU8(entry).trim();
    } else if (name === 'warehouses') {
      result.warehouses = parseLuaTable(strFromU8(entry));
    } else if (name === 'options') {
      result.options = parseLuaTable(strFromU8(entry));
    } else if (name === 'l10n/DEFAULT/dictionary') {
      result.dictionary = parseDictionary(strFromU8(entry));
    } else if (name === 'l10n/DEFAULT/mapResource') {
      result.mapResource = parseMapResource(strFromU8(entry));
    } else if (name.startsWith('KNEEBOARD/')) {
      result.kneeboardFiles.set(name, entry);
    } else if (isBriefingImageEntry(name)) {
      result.briefingImages.set(name, entry);
    }
  }

  return result;
}

// Importing this module from the main thread to share ZIP_LIMITS must not
// install a main-thread message handler. Dedicated workers do not expose document.
if (typeof self !== 'undefined' && typeof document === 'undefined') {
  self.onmessage = async (e: MessageEvent<{ file: ArrayBuffer }>) => {
    try {
      const result = await parseMissionArchive(new Uint8Array(e.data.file));
      self.postMessage({ type: 'success', data: result });
    } catch (error) {
      self.postMessage({ type: 'error', error: asError(error).message });
    }
  };
}
