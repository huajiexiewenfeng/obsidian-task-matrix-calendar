import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const artifacts = ['main.js', 'manifest.json', 'styles.css'];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function availableBackupPath(root, name) {
  let candidate = join(root, name);
  let sequence = 2;
  while (existsSync(candidate)) {
    candidate = join(root, `${name}-${sequence}`);
    sequence += 1;
  }
  return candidate;
}

const vault = resolve(argument('--vault') ?? process.env.OBSIDIAN_VAULT ?? '');
if (!vault || !existsSync(vault)) fail('请通过 --vault 或 OBSIDIAN_VAULT 指定现有 Vault。');
const obsidian = join(vault, '.obsidian');
if (!existsSync(obsidian) || !statSync(obsidian).isDirectory()) {
  fail(`目标不是有效 Obsidian Vault（缺少 .obsidian）：${vault}`);
}
if (basename(vault) === 'Obsidian Vault' && process.env.ALLOW_PRODUCTION_VAULT !== 'YES') {
  fail('检测到主 Vault；如已确认，请设置 ALLOW_PRODUCTION_VAULT=YES 后重试。');
}
for (const artifact of artifacts) {
  if (!existsSync(join(projectRoot, artifact))) fail(`缺少构建产物：${artifact}`);
}

const pluginsRoot = join(obsidian, 'plugins');
const target = join(pluginsRoot, 'task-matrix-calendar');
const backupRoot = join(obsidian, 'plugin-backups', 'task-matrix-calendar');
mkdirSync(pluginsRoot, { recursive: true });
for (const entry of readdirSync(pluginsRoot)) {
  const prefix = 'task-matrix-calendar.backup-';
  if (!entry.startsWith(prefix)) continue;
  mkdirSync(backupRoot, { recursive: true });
  const source = join(pluginsRoot, entry);
  const backup = availableBackupPath(backupRoot, entry.slice(prefix.length));
  cpSync(source, backup, { recursive: true });
  rmSync(source, { recursive: true, force: true });
}
if (existsSync(target)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = join(backupRoot, stamp);
  mkdirSync(backupRoot, { recursive: true });
  cpSync(target, backup, { recursive: true });
  rmSync(target, { recursive: true, force: true });
}
mkdirSync(target, { recursive: true });
for (const artifact of artifacts) cpSync(join(projectRoot, artifact), join(target, artifact));

const deployed = readdirSync(target).sort();
if (deployed.join('\n') !== [...artifacts].sort().join('\n')) {
  fail(`安装目录包含意外文件：${deployed.join(', ')}`);
}
process.stdout.write(`Installed task-matrix-calendar to ${target}\n`);
