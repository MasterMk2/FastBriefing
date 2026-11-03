import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const [pydcsRootArgument, sourceRevision = 'local checkout'] = process.argv.slice(2);

if (!pydcsRootArgument) {
  throw new Error('Usage: node tools/update-threat-ranges.mjs <pydcs-root> [source-revision]');
}

const pydcsRoot = resolve(pydcsRootArgument);
const sourceFiles = [
  join(pydcsRoot, 'dcs', 'vehicles.py'),
  join(pydcsRoot, 'dcs', 'ships.py'),
];
const outputPath = join(projectRoot, 'src', 'data', 'threatRanges.json');

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function parsePythonString(value, filePath, lineNumber) {
  if (!value.startsWith('"')) {
    throw new Error(`${filePath}:${lineNumber}: expected a double-quoted generated id`);
  }
  return JSON.parse(value);
}

function parseReferences(source, filePath) {
  const lines = source.split(/\r?\n/);
  const references = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const classMatch = line.match(/^(\s*)class\s+\w+\(unittype\.(?:VehicleType|ShipType)\):\s*$/);
    if (!classMatch) continue;

    const classIndentation = classMatch[1].length;
    let id;
    let threatRange;
    let detectionRange;
    let cursor = index + 1;

    for (; cursor < lines.length; cursor += 1) {
      const childLine = lines[cursor];
      if (childLine.trim() !== '' && indentation(childLine) <= classIndentation) break;

      const idMatch = childLine.match(/^\s+id\s*=\s*("(?:\\.|[^"\\])*")\s*$/);
      if (idMatch) id = parsePythonString(idMatch[1], filePath, cursor + 1);

      const rangeMatch = childLine.match(/^\s+(threat_range|detection_range)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (rangeMatch) {
        const value = Number(rangeMatch[2]);
        if (rangeMatch[1] === 'threat_range') threatRange = value;
        if (rangeMatch[1] === 'detection_range') detectionRange = value;
      }
    }

    if (!id || threatRange === undefined || detectionRange === undefined) {
      throw new Error(`${filePath}:${index + 1}: generated unit class is missing id/threat_range/detection_range`);
    }
    if (references.has(id)) throw new Error(`${filePath}:${index + 1}: duplicate unit id ${id}`);
    references.set(id, { threatRange, detectionRange });
    index = cursor - 1;
  }

  if (references.size === 0) throw new Error(`${filePath}: no pydcs unit references found`);
  return references;
}

function compareKeys([left], [right]) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const existing = JSON.parse(await readFile(outputPath, 'utf8'));
const retainedReferences = new Map(
  Object.entries(existing).filter(([key]) => !key.startsWith('$')),
);
const generatedReferences = new Map();

for (const sourceFile of sourceFiles) {
  const source = await readFile(sourceFile, 'utf8');
  for (const [id, reference] of parseReferences(source, sourceFile)) {
    if (generatedReferences.has(id)) throw new Error(`Duplicate pydcs unit id across source files: ${id}`);
    generatedReferences.set(id, reference);
  }
}

// Existing keys absent from the current export are application aliases or
// compatibility entries. Exact pydcs ids always replace retained values.
const mergedReferences = new Map(retainedReferences);
for (const [id, reference] of generatedReferences) mergedReferences.set(id, reference);

const separatorAliases = {
  'HL_ZU-23': 'HL-ZU-23',
};
for (const [alias, canonical] of Object.entries(separatorAliases)) {
  const reference = mergedReferences.get(canonical);
  if (!reference) throw new Error(`Cannot create ${alias}; canonical pydcs id ${canonical} is missing`);
  mergedReferences.set(alias, reference);
}

const output = {
  $source: `pydcs/dcs/vehicles.py and pydcs/dcs/ships.py @ ${sourceRevision}`,
  $units: 'Values are metres; threatRange is threat_range and detectionRange is detection_range.',
  $retained: 'Existing non-export keys are retained as application aliases or backwards-compatible unit ids.',
  ...Object.fromEntries([...mergedReferences.entries()].sort(compareKeys)),
};

const outputEntries = Object.entries(output);
const outputLines = outputEntries.map(([key, value], index) => {
  const comma = index === outputEntries.length - 1 ? '' : ',';
  return `  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`;
});
await writeFile(outputPath, `{\n${outputLines.join('\n')}\n}\n`, 'utf8');
console.log(JSON.stringify({
  output: 'src/data/threatRanges.json',
  generated: generatedReferences.size,
  retainedOrAliased: mergedReferences.size - generatedReferences.size,
  total: mergedReferences.size,
  sourceRevision,
}));
