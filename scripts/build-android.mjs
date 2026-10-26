// Build bản web nhúng vào APK rồi chép sang dự án Android. Dùng node để chạy được cả Windows lẫn Linux (CI).
import { spawnSync } from 'node:child_process';

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('npx', ['vite', 'build'], { BUILD_TARGET: 'android' });
run('npx', ['cap', 'sync', 'android']);
