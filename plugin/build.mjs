// Builds dist/code.js (Figma sandbox) and dist/ui.html (iframe, JS and CSS inlined).
// --preview also writes dist/preview.html, which runs the UI in a browser against mock data.
import * as esbuild from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const preview = process.argv.includes('--preview');

// @create-figma-plugin/ui marks global CSS imports with a leading "!".
const bangImports = {
  name: 'bang-imports',
  setup(build) {
    build.onResolve({ filter: /^!/ }, (args) =>
      build.resolve(args.path.slice(1), { resolveDir: args.resolveDir, kind: args.kind }),
    );
  },
};

const inlineUi = {
  name: 'inline-ui',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0 || !result.outputFiles) return;
      const output = (ext) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text ?? '';
      const js = output('.js').replace(/<\/script/g, '<\\/script');
      const template = await readFile('src/ui/index.html', 'utf8');
      const fill = (style, script) =>
        template.replace('<!--STYLE-->', () => `<style>${style}</style>`).replace('<!--SCRIPT-->', () => `<script>${script}</script>`);
      await mkdir('dist', { recursive: true });
      await writeFile('dist/ui.html', fill(output('.css'), js));
      if (preview) {
        const theme = await readFile('node_modules/@create-figma-plugin/ui/lib/css/theme.css', 'utf8');
        const mock = await readFile('test/preview-mock.js', 'utf8');
        // No doctype, so the preview runs in quirks mode like the plugin iframe does.
        const page = fill(theme + output('.css'), mock + js).replace(/^<!doctype html>\n/i, '');
        await writeFile('dist/preview.html', page);
      }
    });
  },
};

const main = {
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2017',
  logLevel: 'info',
};

const ui = {
  entryPoints: ['src/ui/index.tsx'],
  bundle: true,
  write: false,
  outfile: 'dist/ui.js',
  target: 'es2020',
  // Figma renders plugin UI in quirks mode, where class names match case-insensitively.
  // Minified CSS-module names (".a" vs ".A") would collide there, so identifiers are kept.
  minifyWhitespace: !watch,
  minifySyntax: !watch,
  logLevel: 'info',
  plugins: [bangImports, inlineUi],
};

if (watch) {
  const contexts = await Promise.all([esbuild.context(main), esbuild.context(ui)]);
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all([esbuild.build(main), esbuild.build(ui)]);
}
