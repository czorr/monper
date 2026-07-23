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
          content: resolve(__dirname, 'src/preload/content.ts')
        },
        output: cjsOutput
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          menu: resolve(__dirname, 'src/renderer/menu.html'),
          newtab: resolve(__dirname, 'src/renderer/newtab.html')
        }
      }
    },
    plugins: [react(), tailwindcss(), Icons({ compiler: 'jsx', jsx: 'react' })]
  }
})
