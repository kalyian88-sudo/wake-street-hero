/* WHY NOT: Wake Street Hero — service worker (placeholder; finalised in the PWA stage).
   `self.__PRECACHE__` and `self.__BUILD__` are replaced at build time by scripts/vite-sw-plugin.ts. */
const PRECACHE = self.__PRECACHE__;
const BUILD = self.__BUILD__;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
void PRECACHE; void BUILD;
