import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');
const publicRoot = path.join(projectRoot, 'public');
const sourceFiles = await collectFiles(sourceRoot);
const missing = [];
const assetPattern = /['"`]((?:\/)?assets\/[^'"`\s]+)['"`]/g;

for (const file of sourceFiles) {
  if (!/\.(?:ts|tsx|js|jsx|json|css)$/.test(file)) continue;
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(assetPattern)) {
    const assetPath = match[1].replace(/^\//, '').replaceAll('\\', '/');
    if (assetPath.includes('${')) continue;
    const diskPath = path.join(publicRoot, ...assetPath.split('/'));
    try {
      if (!(await stat(diskPath)).isFile()) missing.push({ file, assetPath });
    } catch {
      missing.push({ file, assetPath });
    }
  }
}

if (missing.length) {
  console.error('内容资源校验失败：');
  for (const issue of missing) console.error(`- ${path.relative(projectRoot, issue.file)} -> ${issue.assetPath}`);
  process.exitCode = 1;
} else {
  console.log(`内容资源校验通过：已检查 ${sourceFiles.length} 个源码文件中的静态资源引用。`);
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}
