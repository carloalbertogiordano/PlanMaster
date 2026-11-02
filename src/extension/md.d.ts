// Markdown files are bundled as text; this tells the compiler what such an import gives.
declare module '*.md' {
  const text: string;
  export default text;
}
