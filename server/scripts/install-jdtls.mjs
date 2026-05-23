import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { chmod, symlink } from 'node:fs/promises';
import { get } from 'node:https';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const INSTALL_DIR = process.env.JDTLS_INSTALL_DIR ?? '/opt/jdtls';
const BIN_DIR = process.env.JDTLS_BIN_DIR ?? '/usr/local/bin';
const CACHED_ARCHIVE = process.env.JDTLS_ARCHIVE ?? '/storage/jdt-language-server.tar.gz';
const FALLBACK_URL = process.env.JDTLS_FALLBACK_URL ?? 'https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz';

mkdirSync(INSTALL_DIR, { recursive: true });
mkdirSync(BIN_DIR, { recursive: true });

let archivePath = CACHED_ARCHIVE;

if (existsSync(CACHED_ARCHIVE)) {
  console.log(`Using cached jdtls archive ${CACHED_ARCHIVE}`);
} else {
  const url = process.env.JDTLS_URL || (await latestJdtlsUrl().catch(() => FALLBACK_URL));
  archivePath = '/tmp/jdtls.tar.gz';

  console.log(`Downloading jdtls from ${url}`);
  await download(url, archivePath);
}
rmSync(INSTALL_DIR, { recursive: true, force: true });
mkdirSync(INSTALL_DIR, { recursive: true });

const tar = spawnSync('tar', ['-xzf', archivePath, '-C', INSTALL_DIR], { stdio: 'inherit' });
if (tar.status !== 0) process.exit(tar.status ?? 1);

const launcher = join(BIN_DIR, 'jdtls');
rmSync(launcher, { force: true });
await symlink(join(INSTALL_DIR, 'bin', 'jdtls'), launcher);
await chmod(join(INSTALL_DIR, 'bin', 'jdtls'), 0o755);
console.log(`Installed jdtls at ${launcher}`);

async function latestJdtlsUrl() {
  const release = await json('https://api.github.com/repos/eclipse-jdtls/eclipse.jdt.ls/releases/latest');
  const asset = release.assets?.find((item) => /jdt-language-server-.*\.tar\.gz$/.test(item.name));
  if (!asset?.browser_download_url) throw new Error('No jdtls tar.gz asset found in latest GitHub release.');
  return asset.browser_download_url;
}

async function json(url) {
  const chunks = [];
  await request(url, (response) => {
    response.on('data', (chunk) => chunks.push(chunk));
  });
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function download(url, target) {
  await request(url, (response) => pipeline(response, createWriteStream(target)));
}

async function request(url, handleResponse, redirects = 0) {
  await new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'user-agent': 'vibe-ide-lsp-docker' } }, async (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume();
        if (redirects > 5) return reject(new Error('Too many redirects.'));
        try {
          await request(new URL(response.headers.location, url).toString(), handleResponse, redirects + 1);
          resolve();
        } catch (error) {
          reject(error);
        }
        return;
      }

      if ((response.statusCode ?? 500) >= 400) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      try {
        await handleResponse(response);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
