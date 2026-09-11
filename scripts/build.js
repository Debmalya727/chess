import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('[Build] Building apps/web/client...');
execSync('npm run build --workspace=apps/web/client', { stdio: 'inherit', cwd: rootDir });

const clientDist = path.join(rootDir, 'apps', 'web', 'client', 'dist');
const rootDist = path.join(rootDir, 'dist');

if (fs.existsSync(clientDist)) {
  console.log(`[Build] Syncing client build artifacts to ${rootDist}...`);
  fs.cpSync(clientDist, rootDist, { recursive: true });
  console.log('[Build] Output directory successfully prepared at ./dist');
}
