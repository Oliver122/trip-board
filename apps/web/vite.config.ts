import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { joinPreviewPlugin } from './join-preview'

// Same defaults as @tripboard/shared. The config is loaded by Node, which
// cannot follow the shared package's .js specifiers back to .ts sources.
const defaultWebPort = 5180
const defaultApiPort = 4080

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '')
  const webPort = Number(env.WEB_PORT || defaultWebPort)
  const apiPort = Number(env.API_PORT || defaultApiPort)

  return {
    plugins: [joinPreviewPlugin(apiPort), react(), tailwindcss()],
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
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
