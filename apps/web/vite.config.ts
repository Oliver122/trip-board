import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { joinPreviewPlugin } from './join-preview'

// Same defaults as @tripboard/shared. The config is loaded by Node, which
// cannot follow the shared package's .js specifiers back to .ts sources.
const defaultWebPort = 5180
const defaultApiPort = 4080

function apiProxy(apiPort: number) {
  return {
    '/api': {
      target: `http://127.0.0.1:${apiPort}`,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '')
  const webPort = Number(env.WEB_PORT || defaultWebPort)
  const apiPort = Number(env.API_PORT || defaultApiPort)

  return {
    plugins: [joinPreviewPlugin(apiPort), react(), tailwindcss()],
    build: {
      modulePreload: {
        resolveDependencies(_filename, deps) {
          return deps.filter(
            (dep) => !dep.includes('maplibre') && !/MapView|TripMap/.test(dep),
          )
        },
      },
    },
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
      proxy: apiProxy(apiPort),
    },
    preview: {
      host: '127.0.0.1',
      proxy: apiProxy(apiPort),
    },
  }
})
