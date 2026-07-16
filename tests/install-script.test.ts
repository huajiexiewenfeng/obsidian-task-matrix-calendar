import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('install-to-vault script', () => {
  it('installs exactly release artifacts and backs up an existing plugin', () => {
    const root = mkdtempSync(join(tmpdir(), 'tmc-install-'));
    const vault = join(root, 'Development Vault');
    mkdirSync(join(vault, '.obsidian'), { recursive: true });

    execFileSync(process.execPath, ['scripts/install-to-vault.mjs', '--vault', vault], { cwd: process.cwd() });
    const plugin = join(vault, '.obsidian', 'plugins', 'task-matrix-calendar');
    expect(readdirSync(plugin).sort()).toEqual(['main.js', 'manifest.json', 'styles.css']);
    writeFileSync(join(plugin, 'main.js'), 'old build', 'utf8');

    execFileSync(process.execPath, ['scripts/install-to-vault.mjs', '--vault', vault], { cwd: process.cwd() });
    const pluginEntries = readdirSync(join(vault, '.obsidian', 'plugins'));
    expect(pluginEntries).toEqual(['task-matrix-calendar']);
    const backupRoot = join(vault, '.obsidian', 'plugin-backups', 'task-matrix-calendar');
    const backups = readdirSync(backupRoot);
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(backupRoot, backups[0], 'main.js'), 'utf8')).toBe('old build');
  });

  it('refuses the production-named vault without an explicit environment guard', () => {
    const root = mkdtempSync(join(tmpdir(), 'tmc-install-'));
    const vault = join(root, 'Obsidian Vault');
    mkdirSync(join(vault, '.obsidian'), { recursive: true });
    const result = spawnSync(process.execPath, ['scripts/install-to-vault.mjs', '--vault', vault], {
      cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ALLOW_PRODUCTION_VAULT: '' },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ALLOW_PRODUCTION_VAULT=YES');
  });

  it('moves legacy backup folders outside the plugin discovery root', () => {
    const root = mkdtempSync(join(tmpdir(), 'tmc-install-'));
    const vault = join(root, 'Development Vault');
    const pluginsRoot = join(vault, '.obsidian', 'plugins');
    const legacyBackup = join(pluginsRoot, 'task-matrix-calendar.backup-legacy');
    mkdirSync(legacyBackup, { recursive: true });
    writeFileSync(join(legacyBackup, 'main.js'), 'legacy build', 'utf8');
    writeFileSync(
      join(legacyBackup, 'manifest.json'),
      JSON.stringify({ id: 'task-matrix-calendar' }),
      'utf8',
    );

    execFileSync(process.execPath, ['scripts/install-to-vault.mjs', '--vault', vault], {
      cwd: process.cwd(),
    });

    expect(readdirSync(pluginsRoot)).toEqual(['task-matrix-calendar']);
    expect(
      readFileSync(
        join(vault, '.obsidian', 'plugin-backups', 'task-matrix-calendar', 'legacy', 'main.js'),
        'utf8',
      ),
    ).toBe('legacy build');
  });
});
