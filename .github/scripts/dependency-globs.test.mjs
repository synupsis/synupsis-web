import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'synupsis-globs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'nested'));
  for (const name of ['keep.txt', 'remove.tmp', 'nested/keep.txt', 'nested/remove.tmp']) {
    writeFileSync(join(directory, name), name);
  }
  return directory;
}

// The security resolutions cross major versions. Exercise the real consumers,
// including ESLint's cache deletion after upgrading its rimraf dependency.
test('flat-cache removes its cache without deleting unrelated files', t => {
  const directory = fixture(t);
  const flatCache = require('flat-cache');
  const cache = flatCache.load('eslint-cache', directory);
  cache.setKey('source.js', { changed: false });
  cache.save();
  assert.ok(readdirSync(directory).includes('eslint-cache'));
  cache.destroy();
  assert.deepEqual(readdirSync(directory).sort(), ['keep.txt', 'nested', 'remove.tmp']);
  assert.deepEqual(readdirSync(join(directory, 'nested')).sort(), ['keep.txt', 'remove.tmp']);
});

test('filelist includes and excludes patterns with the patched minimatch', t => {
  const directory = fixture(t);
  const { FileList } = require('filelist');
  const files = new FileList(join(directory, '**/*.{txt,tmp}'));
  files.exclude(join(directory, '**/*.tmp'));
  assert.deepEqual(files.toArray().sort(), [join(directory, 'keep.txt'), join(directory, 'nested/keep.txt')].sort());
});

test('archive file expansion and zip globbing keep nested files and exclusions', async t => {
  const directory = fixture(t);
  const archiver = require('archiver');
  const archiveRequire = createRequire(require.resolve('archiver'));
  const utils = archiveRequire('archiver-utils');
  assert.deepEqual(utils.file.expand({ cwd: directory }, ['**/*.txt', '!nested/**']), ['keep.txt']);

  const archive = archiver('zip');
  const entries = [];
  archive.on('entry', entry => entries.push(entry.name));
  const finished = new Promise((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
    archive.on('warning', reject);
  });
  archive.resume();
  archive.glob('**/*.txt', { cwd: directory, ignore: ['**/*.tmp'] });
  await Promise.all([archive.finalize(), finished]);
  assert.deepEqual(entries.sort(), ['keep.txt', 'nested/keep.txt']);
});
