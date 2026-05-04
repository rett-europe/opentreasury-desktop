#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const md = new MarkdownIt({ html: true, linkify: true });

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;
const BUILD_DATE = new Date().toISOString().split('T')[0];

// Inline SVG logo from build/icon.svg
const LOGO_SVG = readFileSync(join(ROOT, 'build', 'icon.svg'), 'utf-8')
  .replace(/width="1024"/, 'width="48"')
  .replace(/height="1024"/, 'height="48"');

const STYLE = `
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  margin: 0;
  padding: 0;
  background: #fff;
}
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}
header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #534AB7;
}
header svg {
  flex-shrink: 0;
}
header h1 {
  margin: 0;
  font-size: 1.75rem;
  color: #534AB7;
}
.lang-label {
  font-size: 0.875rem;
  color: #666;
  margin-left: auto;
}
h1, h2, h3, h4 {
  color: #534AB7;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}
h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.25rem; }
h4 { font-size: 1.1rem; }
a {
  color: #534AB7;
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
code {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  background: #f4f4f4;
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  font-size: 0.9em;
}
pre {
  background: #f4f4f4;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
}
pre code {
  background: none;
  padding: 0;
}
blockquote {
  border-left: 4px solid #534AB7;
  padding-left: 1rem;
  margin-left: 0;
  color: #555;
  font-style: italic;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1rem 0;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
}
th, td {
  border: 1px solid #ddd;
  padding: 0.5rem;
  text-align: left;
}
th {
  background: #534AB7;
  color: white;
}
footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid #ddd;
  font-size: 0.875rem;
  color: #666;
  text-align: center;
}
`;

function base64Image(imagePath) {
  if (!existsSync(imagePath)) {
    console.warn(`⚠️  Image not found: ${imagePath} (skipping)`);
    return null;
  }
  const buffer = readFileSync(imagePath);
  const ext = imagePath.split('.').pop().toLowerCase();
  const mime =
    ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function processMarkdown(markdown, guideDir) {
  // Replace image references with base64 data URIs
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    // Resolve relative paths
    const imagePath = src.startsWith('./')
      ? join(guideDir, src)
      : src.startsWith('/')
        ? join(ROOT, src.slice(1))
        : join(guideDir, src);

    const dataUri = base64Image(imagePath);
    if (!dataUri) {
      console.warn(`  Keeping original reference: ${src}`);
      return match;
    }
    return `![${alt}](${dataUri})`;
  });
}

function buildGuide(inputPath, outputPath, title, langLabel) {
  console.log(`📄 Building ${outputPath}...`);

  const guideDir = dirname(inputPath);
  const markdownSource = readFileSync(inputPath, 'utf-8');
  const processedMarkdown = processMarkdown(markdownSource, guideDir);
  const htmlBody = md.render(processedMarkdown);

  const html = `<!DOCTYPE html>
<html lang="${langLabel.startsWith('ES') ? 'es' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="container">
    <header>
      ${LOGO_SVG}
      <h1>${title}</h1>
      <span class="lang-label">${langLabel}</span>
    </header>
    ${htmlBody}
    <footer>
      OpenTreasury Desktop v${VERSION} · Built ${BUILD_DATE}
    </footer>
  </div>
</body>
</html>`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, 'utf-8');
  console.log(`✅ ${outputPath}`);
}

const guides = [
  {
    input: join(ROOT, 'docs/guides/user-guide.md'),
    output: join(ROOT, 'dist-guides/user-guide-en.html'),
    title: 'OpenTreasury — User Guide',
    langLabel: 'English',
  },
  {
    input: join(ROOT, 'docs/guides/user-guide.es.md'),
    output: join(ROOT, 'dist-guides/user-guide-es.html'),
    title: 'OpenTreasury — Guía de Usuario',
    langLabel: 'Español',
  },
];

console.log('🔨 Building user guides...\n');
guides.forEach(({ input, output, title, langLabel }) => {
  buildGuide(input, output, title, langLabel);
});
console.log('\n✨ Done!');
