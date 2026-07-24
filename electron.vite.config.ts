import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'

// main y preload en CommonJS: así `require('electron')` resuelve al módulo
// integrado del runtime y no al wrapper npm (que rompe bajo ESM).
const cjsOutput = { format: 'cjs' as const, entryFileNames: '[name].js' }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron'],
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        output: cjsOutput
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron'],
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          content: resolve(__dirname, 'src/preload/content.ts'),
          vaultwin: resolve(__dirname, 'src/preload/vaultwin.ts'),
          omnibox: resolve(__dirname, 'src/preload/omnibox.ts'),
          siteinfo: resolve(__dirname, 'src/preload/siteinfo.ts')
        },
        output: cjsOutput
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          newtab: resolve(__dirname, 'src/renderer/newtab.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          vault: resolve(__dirname, 'src/renderer/vault.html'),
          omnibox: resolve(__dirname, 'src/renderer/omnibox.html'),
          siteinfo: resolve(__dirname, 'src/renderer/siteinfo.html')
        }
      }
    },
    plugins: [react(), tailwindcss(), Icons({ compiler: 'jsx', jsx: 'react' })]
  }
})
