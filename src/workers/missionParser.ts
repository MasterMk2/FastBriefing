import { unzipSync, strFromU8 } from 'fflate';
import { parse } from 'luaparse';

interface ParsedMissionFile {
  mission: unknown;
  theatre: string;
  warehouses: unknown;
  options: unknown;
  dictionary: Record<string, string>;
  mapResource: Record<string, string>;
  kneeboardFiles: Map<string, Uint8Array>;
}

const UTF8 = new TextDecoder('utf-8');

/**
 * Decode a luaparse `pseudo-latin1` string back into real text.
 *
 * In that mode luaparse requires every code unit to be <= 0xFF and hands the
 * literal back the same way, so a string is a sequence of BYTES stored one per
 * code unit. The mission Lua is UTF-8, so those bytes have to be decoded or
 * every non-ASCII name comes out as mojibake ("エルブルス" -> "ã¨ã«ãã«ã¹").
 */
export function decodeLuaString(value: string): string {
  // Fast path: pure ASCII is already correct and covers most of a mission file.
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7f]/.test(value)) return value;
  return UTF8.decode(Uint8Array.from(value, (c) => c.charCodeAt(0) & 0xff));
}

/**
 * @param luaBytes raw bytes of the Lua file, NOT a decoded string.
 *
 * The bytes are decoded as latin1 so that one code unit is one UTF-8 byte,
 * which is what `pseudo-latin1` requires. Handing it a UTF-8-decoded string
 * instead is what produced
 *   "[1189:8] code unit U+30A8 is not allowed in the current encoding mode"
 * on any mission containing Japanese (U+30A8 is エ) -- the file loaded fine in
 * English and failed outright in Japanese.
 *
 * `encodingMode: 'none'` looks like the obvious fix and is a trap: it accepts
 * every code unit but sets `discardStrings`, so `StringLiteral.value` comes
 * back `null` and every name and description in the mission silently becomes
 * empty. Verified against luaparse 0.3.1.
 */
export function parseLuaTable(luaBytes: Uint8Array): unknown {
  try {
    const luaCode = strFromU8(luaBytes, true);
    const ast = parse(luaCode, { encodingMode: 'pseudo-latin1' });

    if (ast.type === 'Chunk' && ast.body.length > 0) {
      const firstStat = ast.body[0];
      if (firstStat.type === 'AssignmentStatement' && firstStat.variables.length > 0) {
        const varExpr = firstStat.variables[0];
        if (varExpr.type === 'Identifier' && varExpr.name === 'mission') {
          // `init` is an ARRAY of expressions (Lua allows `a, b = 1, 2`), so
          // the table is init[0]. Passing the array itself fell through
          // convertLuaNode's switch to `default`, which returns the raw AST
          // node -- every mission came back as unconverted luaparse output
          // with no usable fields. Separate, pre-existing bug; the encoding
          // failure simply hid it by throwing first.
          return convertLuaNode(firstStat.init[0]);
        }
      }
    }
    throw new Error('Mission table not found in Lua code');
  } catch (e) {
    console.error('Lua parse error:', e);
    throw e;
  }
}

function convertLuaNode(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  
  const n = node as Record<string, unknown>;
  
  switch (n.type) {
    case 'TableConstructorExpression':
      const result: Record<string, unknown> = {};
      const fields = (n.fields as unknown[]) || [];
      for (const field of fields) {
        const f = field as { type: string; key?: unknown; value?: unknown; name?: string };
        if (f.type === 'TableKey' && f.key && f.value) {
          const key = convertLuaNode(f.key);
          const value = convertLuaNode(f.value);
          if (typeof key === 'string' || typeof key === 'number') {
            result[String(key)] = value;
          }
        } else if (f.type === 'TableKeyString' && f.key && f.value) {
          const rawKey = f.key as { name?: string; value?: string };
          // `name` is a Lua identifier and therefore ASCII; `value` is a
          // string literal and carries the same byte-per-code-unit encoding
          // as any other one.
          const key =
            rawKey.name ?? (rawKey.value !== undefined ? decodeLuaString(rawKey.value) : '');
          const value = convertLuaNode(f.value);
          result[key] = value;
        } else if (f.type === 'TableValue' && f.value) {
          const value = convertLuaNode(f.value);
          if (Array.isArray(result)) {
            result.push(value);
          } else {
            const idx = Object.keys(result).length + 1;
            result[idx] = value;
          }
        }
      }
      return result;
      
    case 'NumericLiteral':
      return n.value;
      
    case 'StringLiteral':
      return decodeLuaString(n.value as string);
      
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

function parseDictionary(content: string): Record<string, string> {
  const dict: Record<string, string> = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*=\s*"(.*)"$/);
    if (match) {
      dict[`DictKey_${match[1]}`] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  return dict;
}

function parseMapResource(content: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*=\s*"(.*)"$/);
    if (match) {
      map[`ResKey_${match[1]}`] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  return map;
}

/**
 * Parse a .miz archive into its component tables.
 *
 * Kept separate from the worker plumbing so it can be called directly: the
 * module previously assigned `self.onmessage` at import time, which throws
 * anywhere there is no `self` and made the whole file impossible to test.
 */
export async function parseMissionArchive(file: ArrayBuffer): Promise<ParsedMissionFile> {
  const zip = unzipSync(new Uint8Array(file)) as Record<string, Uint8Array>;

  const result: ParsedMissionFile = {
    mission: null,
    theatre: '',
    warehouses: null,
    options: null,
    dictionary: {},
    mapResource: {},
    kneeboardFiles: new Map(),
  };

  for (const name of Object.keys(zip)) {
    const entry = zip[name];
    // Only the entries that go through luaparse are handed raw bytes: it is
    // fed latin1 (one code unit per byte) and the strings are decoded on the
    // way out. parseDictionary/parseMapResource are line- and regex-based,
    // never touch luaparse, and want ordinary UTF-8 text -- which is also
    // where most of a Japanese mission's prose lives, so decoding them the
    // other way would break exactly what this fix is for.
    if (name === 'mission') {
      result.mission = parseLuaTable(entry);
    } else if (name === 'theatre') {
      result.theatre = strFromU8(entry).trim();
    } else if (name === 'warehouses') {
      result.warehouses = parseLuaTable(entry);
    } else if (name === 'options') {
      result.options = parseLuaTable(entry);
    } else if (name === 'l10n/DEFAULT/dictionary') {
      result.dictionary = parseDictionary(strFromU8(entry));
    } else if (name === 'l10n/DEFAULT/mapResource') {
      result.mapResource = parseMapResource(strFromU8(entry));
    } else if (name.startsWith('KNEEBOARD/')) {
      result.kneeboardFiles.set(name, entry);
    }
  }

  return result;
}

// Registration is guarded: a test runner has no `self`, and assigning to it
// unconditionally is what made this module unimportable outside a worker.
if (typeof self !== 'undefined') {
  self.onmessage = async (e: MessageEvent<{ file: ArrayBuffer }>) => {
    try {
      self.postMessage({ type: 'success', data: await parseMissionArchive(e.data.file) });
    } catch (error) {
      self.postMessage({ type: 'error', error: (error as Error).message });
    }
  };
}
