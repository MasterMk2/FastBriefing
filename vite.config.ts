import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfig from './tsconfig.json';

type TsConfig = {
  compilerOptions?: {
    target?: string;
    paths?: Record<string, string[]>;
  };
};

function fileUrlToPath(url: URL): string {
  const pathname = decodeURIComponent(url.pathname);
  // file:// URLs include a leading slash before Windows drive letters.
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}

const config = tsconfig as TsConfig;
const compilerOptions = config.compilerOptions ?? {};
const projectRoot = new URL('./', import.meta.url);
const aliases = Object.fromEntries(
  Object.entries(compilerOptions.paths ?? {}).flatMap(([pattern, targets]) => {
    const target = targets[0];
    if (!target) return [];

    const alias = pattern.replace(/\/\*$/, '');
    const source = target.replace(/\/\*$/, '');
    return [[alias, fileUrlToPath(new URL(source, projectRoot))]];
  }),
);
const buildTarget = compilerOptions.target?.toLowerCase() ?? 'esnext';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: aliases,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: buildTarget,
  },
});
