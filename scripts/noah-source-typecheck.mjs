import path from 'node:path';
import ts from 'typescript';

/** Read supplied files and the compiler's own standard library only. Never load
 * host tsconfig, project plugins, ambient packages or execute uploaded source. */
export function checkNoahSourceTypes({ files, root, currentDirectory = root, entrypoints, maxErrors, maxMessageLength }) {
  const library = path.dirname(ts.getDefaultLibFilePath({}));
  const sources = new Map(files.map(f => [root + '/' + f.name, f.content]));
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, allowJs: true, checkJs: false, skipLibCheck: true, types: [], allowImportingTsExtensions: true, lib: ['lib.es2022.d.ts'] };
  const read = name => sources.get(name) ?? (path.dirname(name) === library && /^lib\..*\.d\.ts$/.test(path.basename(name)) ? ts.sys.readFile(name) : undefined);
  const host = { ...ts.createCompilerHost(options), getCurrentDirectory: () => currentDirectory, readFile: read, fileExists: name => read(name) !== undefined,
    directoryExists: name => name === root || name === library || [...sources.keys()].some(f => f.startsWith(name + '/')),
    getSourceFile: (name, version) => { const text = read(name); return text === undefined ? undefined : ts.createSourceFile(name, text, version, true); } };
  const program = ts.createProgram(entrypoints.map(name => root + '/' + name), options, host);
  return ts.getPreEmitDiagnostics(program).filter(d => d.category === ts.DiagnosticCategory.Error).slice(0, maxErrors)
    .map(d => `${d.file ? path.posix.relative(root, d.file.fileName) : 'code'}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, maxMessageLength)}`);
}
