import { unzipSync, strFromU8 } from 'fflate';
import { parse } from 'luaparse';

const ZIP_LIMITS = {
  MAX_ENTRIES: 100,
  MAX_TOTAL_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_ENTRY_SIZE: 10 * 1024 * 1024, // 10 MB
  MAX_COMPRESSION_RATIO: 100,
} as const;

interface ParsedMissionFile {
  mission: unknown;
  theatre: string;
  warehouses: unknown;
  options: unknown;
  dictionary: Record<string, string>;
  mapResource: Record<string, string>;
  kneeboardFiles: Map<string, Uint8Array>;
}

function parseLuaTable(luaCode: string): unknown {
  try {
    const ast = parse(luaCode, { encodingMode: 'pseudo-latin1' });
    
    if (ast.type === 'Chunk' && ast.body.length > 0) {
      const firstStat = ast.body[0];
      if (firstStat.type === 'AssignmentStatement' && firstStat.variables.length > 0) {
        const varExpr = firstStat.variables[0];
        if (varExpr.type === 'Identifier' && varExpr.name === 'mission') {
          return convertLuaNode(firstStat.init);
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
          const key = (f.key as { name?: string; value?: string }).name ?? (f.key as { name?: string; value?: string }).value ?? '';
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
      return n.value;
      
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

self.onmessage = async (e: MessageEvent<{ file: ArrayBuffer }>) => {
  try {
    const { file } = e.data;
    const uint8Array = new Uint8Array(file);
    const zip = unzipSync(uint8Array) as Record<string, Uint8Array>;
    
    const entries = Object.keys(zip);
    if (entries.length > ZIP_LIMITS.MAX_ENTRIES) {
      throw new Error(`ZIP contains too many entries: ${entries.length} > ${ZIP_LIMITS.MAX_ENTRIES}`);
    }
    
    let totalSize = 0;
    for (const name of entries) {
      const entry = zip[name];
      if (entry.length > ZIP_LIMITS.MAX_ENTRY_SIZE) {
        throw new Error(`ZIP entry too large: ${name} (${entry.length} bytes > ${ZIP_LIMITS.MAX_ENTRY_SIZE} bytes)`);
      }
      totalSize += entry.length;
      if (totalSize > ZIP_LIMITS.MAX_TOTAL_SIZE) {
        throw new Error(`ZIP total uncompressed size exceeds limit: ${totalSize} > ${ZIP_LIMITS.MAX_TOTAL_SIZE}`);
      }
      const compressionRatio = uint8Array.length / entry.length;
      if (compressionRatio > ZIP_LIMITS.MAX_COMPRESSION_RATIO) {
        throw new Error(`Suspicious compression ratio for ${name}: ${compressionRatio.toFixed(1)} > ${ZIP_LIMITS.MAX_COMPRESSION_RATIO}`);
      }
    }
    
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
      const content = strFromU8(entry);
      
      if (name === 'mission') {
        result.mission = parseLuaTable(content);
      } else if (name === 'theatre') {
        result.theatre = content.trim();
      } else if (name === 'warehouses') {
        result.warehouses = parseLuaTable(content);
      } else if (name === 'options') {
        result.options = parseLuaTable(content);
      } else if (name === 'l10n/DEFAULT/dictionary') {
        result.dictionary = parseDictionary(content);
      } else if (name === 'l10n/DEFAULT/mapResource') {
        result.mapResource = parseMapResource(content);
      } else if (name.startsWith('KNEEBOARD/')) {
        result.kneeboardFiles.set(name, entry);
      }
    }
    
    self.postMessage({ type: 'success', data: result });
  } catch (error) {
    self.postMessage({ type: 'error', error: (error as Error).message });
  }
};