import ts from 'typescript';

const host = {
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getCanonicalFileName: file => file,
  getNewLine: () => ts.sys.newLine,
};
const config = ts.getParsedCommandLineOfConfigFile('tsconfig.json', {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: diagnostic => {
    console.error(ts.formatDiagnostic(diagnostic, host));
    process.exitCode = 1;
  },
});
if (config) {
  const program = ts.createProgram(config.fileNames, config.options);
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
    process.exitCode = 1;
  } else {
    console.log('TypeScript: 0 errors');
  }
}
