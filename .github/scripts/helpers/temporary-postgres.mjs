import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tests always create their own cluster; no local or remote application database
// is contacted. pg_config locates server binaries on macOS and CI Linux hosts.
export function temporaryPostgres(t) {
  let binaries;
  try {
    binaries = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!existsSync(join(binaries, 'initdb'))) throw new Error('initdb missing');
  } catch {
    if (process.env.CI) throw new Error('PostgreSQL server binaries are required for database regression tests.');
    t.skip('Install PostgreSQL server binaries to run the isolated database regression tests.');
    return null;
  }
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'synupsis-db-test-'));
  const data = join(directory, 'data');
  const log = join(directory, 'postgres.log');
  const port = '55447'; // Private Unix socket directory; TCP is disabled.
  let started = false;
  t.after(() => {
    if (started) execFileSync(join(binaries, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    rmSync(directory, { recursive: true, force: true });
  });
  execFileSync(join(binaries, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { stdio: 'pipe' });
  try {
    execFileSync(join(binaries, 'pg_ctl'), ['-D', data, '-l', log, '-o', `-h '' -k '${directory}' -p ${port}`, '-w', 'start'], { stdio: 'pipe' });
    started = true;
  } catch (error) {
    throw new Error(`${error.message}\n${existsSync(log) ? readFileSync(log, 'utf8') : ''}`);
  }
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', port, '-U', 'postgres', '-d', 'postgres'];
  function sql(source) {
    return execFileSync(join(binaries, 'psql'), args, { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  }
  function session() {
    const child = spawn(join(binaries, 'psql'), args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    const listeners = new Set();
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      for (const listener of listeners) listener();
    });
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
    });
    // The caller may wait for an explicit SQL marker before releasing a lock.
    function waitFor(marker) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`SQL marker not received: ${marker}\n${errors}`)), 5_000);
        const check = () => {
          if (!output.includes(marker)) return;
          clearTimeout(timer);
          listeners.delete(check);
          resolve();
        };
        listeners.add(check);
        check();
        done.catch(error => { clearTimeout(timer); reject(error); });
      });
    }
    t.after(() => child.kill());
    return { write: source => child.stdin.write(source), end: source => { child.stdin.end(source); return done; }, waitFor };
  }
  return { sql, session };
}
