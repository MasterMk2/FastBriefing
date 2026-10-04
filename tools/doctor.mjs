// Only allow-listed environment facts: never dump process.env or local data.
import { readFileSync } from 'node:fs';

const project = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
console.log(JSON.stringify({
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  expected: project.engines,
  packageManager: project.packageManager,
}, null, 2));
