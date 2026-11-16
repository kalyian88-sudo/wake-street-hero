import type { Plugin } from 'vite';

/**
 * Tiny build-time plugin: after the bundle is written it injects the list of emitted files
 * (and a build hash) into `dist/sw.js`, replacing the `self.__PRECACHE__` / `self.__BUILD__`
 * placeholders. The service worker source lives in `public/sw.js`.
 */
export function swPrecachePlugin(): Plugin {
  return {
    name: 'whynot-sw-precache',
    apply: 'build',
    enforce: 'post',
    async writeBundle(options, bundle) {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const outDir = options.dir ?? 'dist';
      const swPath = path.join(outDir, 'sw.js');
      let src: string;
      try {
        src = await fs.readFile(swPath, 'utf8');
      } catch {
        return; // no service worker yet
      }
      const files = new Set<string>(['./', './index.html']);
      for (const name of Object.keys(bundle)) files.add('./' + name);
      const walk = async (dir: string, rel: string): Promise<void> => {
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) await walk(path.join(dir, e.name), r);
          else if (e.name !== 'sw.js') files.add('./' + r);
        }
      };
      await walk(outDir, '');
      const list = [...files].sort();
      const build = Date.now().toString(36);
      src = src
        .replace(/self\.__PRECACHE__/g, JSON.stringify(list))
        .replace(/self\.__BUILD__/g, JSON.stringify(build));
      await fs.writeFile(swPath, src);
    },
  };
}
