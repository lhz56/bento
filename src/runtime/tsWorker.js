// Type-checks TypeScript lessons with the real compiler, off the main thread. Loaded only when needed.
import ts from 'typescript';
import { LIBS } from './tslib.js';

const AMBIENT = `declare function show(x: any, label?: string): void;
declare function print(...a: any[]): void;
declare function size(w: number, h: number): void;
declare function background(c: string): void;
declare function circle(x: number, y: number, r: number, c?: string): void;
declare function rect(x: number, y: number, w: number, h: number, c?: string): void;
declare function line(x1: number, y1: number, x2: number, y2: number, c?: string, w?: number): void;
declare function text(s: any, x: number, y: number, c?: string): void;
declare var console: { log(...a: any[]): void; info(...a: any[]): void; warn(...a: any[]): void; error(...a: any[]): void; table(x: any): void };
declare function setTimeout(f: (...a: any[]) => void, ms?: number): number;
declare function clearTimeout(id?: number): void;
declare function structuredClone<T>(x: T): T;`;
const files = { ...LIBS, 'bento.d.ts': AMBIENT };
const libCache = new Map();
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleDetection: ts.ModuleDetectionKind.Force,
  strict: true,
  noEmit: true,
  lib: ['lib.es2020.d.ts'],
  types: [],
  skipLibCheck: true,
};

function check(code) {
  const host = {
    getSourceFile(f, v) {
      if (f === 'main.ts') return ts.createSourceFile(f, code, v, true);
      const name = f.replace(/^.*\//, '');
      if (!(name in files)) return undefined;
      if (!libCache.has(name)) libCache.set(name, ts.createSourceFile(name, files[name], v, true));
      return libCache.get(name);
    },
    getDefaultLibFileName: () => 'lib.es2020.d.ts',
    writeFile() {},
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    fileExists: (f) => f === 'main.ts' || f.replace(/^.*\//, '') in files,
    readFile: (f) => (f === 'main.ts' ? code : files[f.replace(/^.*\//, '')]),
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram(['main.ts', 'bento.d.ts'], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === 'main.ts' && d.start != null)
    .slice(0, 6)
    .map((d) => ({
      line: d.file.getLineAndCharacterOfPosition(d.start).line + 1,
      msg: ts.flattenDiagnosticMessageText(d.messageText, ' '),
    }));
}

self.onmessage = (e) => {
  const { id, code } = e.data;
  let diags = [];
  try {
    diags = check(code);
  } catch (err) {
    diags = [];
  }
  self.postMessage({ id, diags });
};
export { check };
