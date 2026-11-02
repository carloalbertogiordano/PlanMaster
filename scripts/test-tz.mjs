// Runs the unit tests under several time zones, including ones with daylight saving time and a half-hour offset.
// Timestamps in queue files are local time, so a test that only passes in one zone is not repeatable.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const zones = ['UTC', 'America/New_York', 'Europe/Rome', 'Asia/Kolkata', 'Pacific/Auckland'];

let failed = 0;
for (const zone of zones) {
  const result = spawnSync(process.execPath, [vitest, 'run', '--project', 'unit', '--reporter', 'dot'], {
    env: { ...process.env, TZ: zone },
    encoding: 'utf8',
  });
  const passed = result.status === 0;
  if (!passed) failed++;
  const summary = /Tests\s+(.*)/.exec(result.stdout)?.[1] ?? 'no summary';
  console.log(`${passed ? 'PASS' : 'FAIL'}  TZ=${zone.padEnd(18)} ${summary}`);
  if (!passed) console.log(result.stdout, result.stderr);
}
process.exitCode = failed === 0 ? 0 : 1;
