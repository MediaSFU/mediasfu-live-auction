import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignored = new Set([
  'node_modules',
  '.git',
  '.dart_tool',
  '.gradle',
  '.angular',
  '.expo',
  '.idea',
  'dist',
  'dist-web',
  'build',
  'private',
]);
const findings = [];
const secretPatterns = [
  /MEDIASFU_API_KEY[ \t]*=[ \t]*(?:"[^"]+"|'[^']+'|[^\s#]+)/i,
  /authorization\s*:\s*["'`]Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  /[A-Fa-f0-9]{48,}/,
];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name === '.env') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (!/\.(png|jpe?g|gif|ico|jar|dill|apk|aab|lock|ttf|otf|woff2?|db|sqlite(?:3)?(?:-wal|-shm)?|tsbuildinfo)$/i.test(entry.name)) {
      const value = fs.readFileSync(file, 'utf8');
      secretPatterns.forEach((pattern) => { if (pattern.test(value)) findings.push(path.relative(root, file)); });
    }
  }
}
walk(root);
if (findings.length) {
  console.error(`Potential public-safety findings: ${[...new Set(findings)].join(', ')}`);
  process.exit(1);
}
console.log('Public-safety scan passed.');
