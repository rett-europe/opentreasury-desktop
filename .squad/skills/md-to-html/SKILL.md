# Markdown to Standalone HTML Pipeline

**Issue:** #264 (Bundle user guides as in-app Help + release asset)

**Status:** ✅ Proven pattern, repeatable for distributable documentation.

---

## Overview

Convert markdown documentation (user guides, admin manuals, reference docs) to self-contained, distributable HTML files that work offline with no external dependencies. All CSS is inlined, all images are base64-embedded, and the result is a single `.html` file that opens correctly with `file://` protocol in any browser.

**Key insight:** Build-time rendering (markdown → HTML) keeps the app bundle lightweight while ensuring docs are always accessible offline. Base64 image embedding eliminates asset path issues in packaged Electron apps.

---

## Use Cases

✅ **Use this pattern for:**
- In-app help documentation (bundled with Electron app)
- GitHub release assets (downloadable guides for offline reference)
- Offline reference docs (API docs, security advisories, migration guides)
- Trial deployment guides (non-technical NGO admin audience)
- Localized documentation (EN, ES, FR, etc.)

❌ **Do NOT use for:**
- In-app copy (use i18n framework directly)
- Dynamic content (use runtime rendering instead)
- Very large docs with hundreds of images (file size becomes unwieldy)

---

## Implementation

### 1. Dependencies

Install `markdown-it` as a dev dependency:

```bash
npm install --save-dev markdown-it
```

Optional plugins (if needed):
- `markdown-it-anchor` — header anchors for internal links
- `markdown-it-highlightjs` — syntax highlighting for code blocks

### 2. Build Script Structure

Create `scripts/build-guides.mjs` (or similar):

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const md = new MarkdownIt({ html: true, linkify: true });

// 1. Read metadata from package.json
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;
const BUILD_DATE = new Date().toISOString().split('T')[0];

// 2. Inline logo SVG (or base64-embed PNG)
const LOGO_SVG = readFileSync(join(ROOT, 'build', 'icon.svg'), 'utf-8')
  .replace(/width="1024"/, 'width="48"')
  .replace(/height="1024"/, 'height="48"');

// 3. Define embedded CSS
const STYLE = `
  body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; }
  h1, h2, h3 { color: #534AB7; }
  code { background: #f4f4f4; padding: 0.125rem 0.25rem; border-radius: 3px; }
  img { max-width: 100%; border: 1px solid #e0e0e0; border-radius: 4px; }
  /* Add more styles as needed */
`;

// 4. Base64-encode images
function base64Image(imagePath) {
  if (!existsSync(imagePath)) {
    console.warn(`⚠️  Image not found: ${imagePath}`);
    return null;
  }
  const buffer = readFileSync(imagePath);
  const ext = imagePath.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// 5. Process markdown: replace image references with base64 data URIs
function processMarkdown(markdown, guideDir) {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    const imagePath = src.startsWith('./') 
      ? join(guideDir, src)
      : join(ROOT, src);
    const dataUri = base64Image(imagePath);
    if (!dataUri) return match; // Keep original if image not found
    return `![${alt}](${dataUri})`;
  });
}

// 6. Generate HTML
function buildGuide(inputPath, outputPath, title, langLabel) {
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
  <header>
    ${LOGO_SVG}
    <h1>${title}</h1>
    <span class="lang-label">${langLabel}</span>
  </header>
  ${htmlBody}
  <footer>
    Built ${BUILD_DATE} · Version ${VERSION}
  </footer>
</body>
</html>`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, 'utf-8');
  console.log(`✅ ${outputPath}`);
}

// 7. Define guides to build
const guides = [
  {
    input: join(ROOT, 'docs/guides/user-guide.md'),
    output: join(ROOT, 'dist-guides/user-guide-en.html'),
    title: 'User Guide',
    langLabel: 'English'
  },
  {
    input: join(ROOT, 'docs/guides/user-guide.es.md'),
    output: join(ROOT, 'dist-guides/user-guide-es.html'),
    title: 'Guía de Usuario',
    langLabel: 'Español'
  }
];

guides.forEach(({ input, output, title, langLabel }) => {
  buildGuide(input, output, title, langLabel);
});
```

### 3. Package.json Scripts

Add build script and hook into packaging:

```json
{
  "scripts": {
    "build:guides": "node scripts/build-guides.mjs",
    "prepackage": "npm run build:guides",
    "package": "electron-builder --config electron-builder.yml"
  }
}
```

The `prepackage` hook ensures guides are built before electron-builder runs.

### 4. Gitignore

Add build output directory:

```
# Build output
dist-guides/
```

### 5. Electron Bundling (if using in-app)

In `electron-builder.yml`, bundle guides as extra resources:

```yaml
extraResources:
  - from: 'dist-guides'
    to: 'guides'
```

Then access from main process:

```typescript
import { app, shell } from 'electron';
import { join } from 'node:path';

const guidePath = join(process.resourcesPath, 'guides', 'user-guide-en.html');
shell.openPath(guidePath); // Opens in default browser
```

### 6. GitHub Release Upload

In `.github/workflows/release.yml`, add guides to artifact upload:

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            artifact_glob: |
              out/*.AppImage
              out/*.deb
              dist-guides/*.html
    steps:
      - name: Build guides
        run: npm run build:guides
      
      - name: Upload to draft Release
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ matrix.artifact_glob }}
```

Upload guides only once (e.g., from Linux job) to avoid duplication.

---

## Design Choices

### Brand Colors

Define your primary brand color and apply consistently:

```css
h1, h2, h3, h4, a {
  color: #534AB7; /* OpenTreasury purple */
}
header {
  border-bottom: 2px solid #534AB7;
}
```

### Typography

- **Body:** Sans-serif (Inter, Segoe UI, system fonts)
- **Code:** Monospace (Consolas, Monaco, Courier New)
- **Line height:** 1.6 for readability
- **Max width:** 800px container for comfortable reading

### Logo Embedding

Two options:

1. **Inline SVG** (preferred for small logos):
   ```javascript
   const LOGO_SVG = readFileSync('build/icon.svg', 'utf-8')
     .replace(/width="1024"/, 'width="48"')
     .replace(/height="1024"/, 'height="48"');
   ```
   Then insert directly: `<header>${LOGO_SVG}<h1>Title</h1></header>`

2. **Base64 PNG** (for raster logos):
   ```javascript
   const LOGO_BASE64 = base64Image('build/icon.png');
   // Insert: <img src="${LOGO_BASE64}" width="48" height="48">
   ```

### Image Embedding

- **PNG screenshots:** Base64-encode and embed as `data:image/png;base64,...`
- **Size impact:** A 1280×800 PNG screenshot (~150KB) becomes ~200KB as base64
- **Trade-off:** Larger HTML file, but eliminates asset path issues and ensures offline access
- **File size guideline:** Keep total HTML under 5MB (adjust screenshot count/resolution if needed)

---

## Testing

### Build Verification

```bash
npm run build:guides
ls dist-guides/  # Verify output files exist
```

### Self-Containment Check

Open `dist-guides/*.html` in a browser:
- Logo displays correctly
- All images render (no broken links)
- Styles applied (purple headings, clean layout)
- Footer shows correct version and build date

### Browser Testing

Test with `file://` protocol:
```bash
# Windows
start dist-guides/user-guide-en.html

# macOS/Linux
open dist-guides/user-guide-en.html
```

Verify in multiple browsers (Chrome, Firefox, Edge, Safari).

### CI/CD Integration

Pre-push gates:
```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
```

---

## Localization

For multi-language guides:

1. **File naming:** `{filename}.{locale-code}.md`
   - Example: `user-guide.md` (EN), `user-guide.es.md` (Spanish)

2. **Output naming:** `{filename}-{locale}.html`
   - Example: `user-guide-en.html`, `user-guide-es.html`

3. **Screenshot localization:** Use `.{locale}.png` suffix
   - EN: `screenshots/01-profile-setup.png`
   - ES: `screenshots/01-profile-setup.es.png`

4. **Build script:** Add to guides array:
   ```javascript
   const guides = [
     { input: 'docs/guides/user-guide.md', output: 'dist-guides/user-guide-en.html', ... },
     { input: 'docs/guides/user-guide.es.md', output: 'dist-guides/user-guide-es.html', ... },
     { input: 'docs/guides/user-guide.fr.md', output: 'dist-guides/user-guide-fr.html', ... },
   ];
   ```

---

## Performance Considerations

### Build Time

- Markdown rendering: Fast (~10-50ms per guide)
- Image base64 encoding: Depends on screenshot count and size
- Total build time: Typically <5 seconds for 2 guides with 7 screenshots each

### File Size

| Component | Typical Size |
|-----------|--------------|
| Base HTML + CSS | ~5KB |
| Inlined SVG logo | ~1KB |
| Markdown content | ~20KB |
| 7 screenshots (1280×800 PNG, base64) | ~1.2MB |
| **Total per guide** | **~1.2-1.3MB** |

**Optimization options:**
- Reduce screenshot resolution (1280×800 → 1024×640)
- Use JPEG for photos, PNG for UI screenshots
- Compress images before base64 encoding (use `imagemin`, `sharp`, etc.)

---

## Maintenance

### Adding New Guides

1. Create markdown file: `docs/guides/{name}.md`
2. Add to guides array in `scripts/build-guides.mjs`
3. Update `electron-builder.yml` extraResources (if bundling)
4. Update release workflow (if uploading to GitHub releases)

### Updating Styles

Edit the `STYLE` constant in `scripts/build-guides.mjs`. Changes apply to all guides on next build.

### Screenshot Updates

1. Regenerate screenshots (via Playwright or manual capture)
2. Place in `docs/guides/screenshots/`
3. Re-run `npm run build:guides` to re-embed images

---

## Related Skills & Decisions

- **Skill:** `localized-user-guide` — Translate guides to additional languages
- **Skill:** `playwright-electron-doc-shots` — Automate screenshot generation
- **Decision:** `.squad/decisions.md` § "Screenshot Naming Convention for Illustrated Guides"

---

## Questions & Gotchas

**Q: Should I use markdown-it or another parser?**  
A: markdown-it is recommended: lightweight, fast, no surprise dependencies. Alternatives: `marked`, `showdown`, `remark` — pick what fits your needs.

**Q: What if an image is missing during build?**  
A: The script logs a warning (`⚠️ Image not found`) and keeps the original markdown reference. The HTML will show a broken image. Fix by adding the missing screenshot or commenting out the reference.

**Q: Can I add syntax highlighting for code blocks?**  
A: Yes. Install `highlight.js` or `markdown-it-highlightjs` and configure markdown-it:
```javascript
import hljs from 'highlight.js';
const md = new MarkdownIt({ highlight: (str, lang) => hljs.highlightAuto(str).value });
```

**Q: How do I handle internal links (e.g., `[See Settings](#settings)`)?**  
A: markdown-it auto-generates heading IDs (lowercase, hyphenated). Links work out of the box. For custom anchors, use `markdown-it-anchor`.

**Q: What if the HTML file is too large (>5MB)?**  
A: Options:
1. Reduce screenshot resolution
2. Compress images before embedding
3. Split into multiple guides
4. Use external image hosting (breaks self-containment)

**Q: Can I use this for API documentation?**  
A: Yes, but consider if you need interactive features (try-it-now, code samples with syntax highlighting). For static reference, this pattern works great.

---

## Example Output Structure

```
dist-guides/
├── user-guide-en.html    (~1.2MB, self-contained)
├── user-guide-es.html    (~1.3MB, self-contained)
└── admin-guide-en.html   (~800KB, self-contained)
```

Each file:
- Opens with `file://` protocol in any browser
- Contains all CSS, logo SVG, and images (base64)
- Shows correct version and build date in footer
- Works offline, no external dependencies

---

## Reusability Checklist

- [ ] Install `markdown-it` as devDependency
- [ ] Create `scripts/build-guides.mjs` with base64 image embedding
- [ ] Define embedded CSS with brand colors
- [ ] Add `build:guides` script to package.json
- [ ] Add `prepackage` hook to run build:guides before electron-builder
- [ ] Add `dist-guides/` to .gitignore
- [ ] (Optional) Bundle guides via electron-builder extraResources
- [ ] (Optional) Upload guides to GitHub releases in CI workflow
- [ ] Test: build, open in browser, verify self-containment
- [ ] Document: update history.md with learnings

---

**Created:** 2026-05-04 (Oracle, Issue #264)  
**Last updated:** 2026-05-04
