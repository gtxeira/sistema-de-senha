import { existsSync, readFileSync } from 'node:fs';

export function checkIsRunningInDocker() {
  if (existsSync('/.dockerenv')) return true;

  try {
    return readFileSync('/proc/1/cgroup', 'utf8').includes('docker');
  } catch {
    return false;
  }
}
