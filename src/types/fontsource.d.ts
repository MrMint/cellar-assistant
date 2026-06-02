// @fontsource/* packages ship CSS only and provide no type declarations, so a
// bare side-effect import like `import "@fontsource/inter"` resolves to a .css
// file with no types and fails type-checking under `moduleResolution: bundler`
// (TS2882). These imports exist purely to register the font's @font-face CSS,
// so declaring the modules as untyped is sufficient.
declare module "@fontsource/*";
