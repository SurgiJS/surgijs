import ts from 'typescript';

if (typeof ts.createSourceFile !== 'function') {
  throw new Error(
    `@surgijs/compiler needs the TypeScript JS API, which typescript ${(ts as { version?: string }).version ?? '7+'} does not ship. ` +
      'Install typescript 5.x or 6.x next to the compiler: npm i -D typescript@6',
  );
}

export default ts;
