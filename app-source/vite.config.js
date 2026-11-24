import { loadEnv } from 'vite';

export default ({ mode, command }) => {
  if (command === 'build' && mode !== 'e2e') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      if (!env[k] && !process.env[k]) throw new Error('Build aborted: ' + k + ' is not set');
    }
  }
  return { base: './', server: { host: true, allowedHosts: true }, preview: { host: true, allowedHosts: true } };
};
