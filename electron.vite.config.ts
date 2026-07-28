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
      // Sin esto el bundle sale SIN minificar (medido: el renderer pesaba el doble).
      minify: 'esbuild',
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
      minify: 'esbuild',
      rollupOptions: {
        external: ['electron'],
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          content: resolve(__dirname, 'src/preload/content.ts'),
          vaultwin: resolve(__dirname, 'src/preload/vaultwin.ts'),
          omnibox: resolve(__dirname, 'src/preload/omnibox.ts'),
          siteinfo: resolve(__dirname, 'src/preload/siteinfo.ts'),
          profilemenu: resolve(__dirname, 'src/preload/profilemenu.ts'),
          profilesubmenu: resolve(__dirname, 'src/preload/profilesubmenu.ts'),
          peekbar: resolve(__dirname, 'src/preload/peekbar.ts'),
          signin: resolve(__dirname, 'src/preload/signin.ts'),
          extensionswin: resolve(__dirname, 'src/preload/extensionswin.ts')
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
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          newtab: resolve(__dirname, 'src/renderer/newtab.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          error: resolve(__dirname, 'src/renderer/error.html'),
          downloads: resolve(__dirname, 'src/renderer/downloads.html'),
          history: resolve(__dirname, 'src/renderer/history.html'),
          bookmarks: resolve(__dirname, 'src/renderer/bookmarks.html'),
          vault: resolve(__dirname, 'src/renderer/vault.html'),
          omnibox: resolve(__dirname, 'src/renderer/omnibox.html'),
          siteinfo: resolve(__dirname, 'src/renderer/siteinfo.html'),
          profilemenu: resolve(__dirname, 'src/renderer/profilemenu.html'),
          profilesubmenu: resolve(__dirname, 'src/renderer/profilesubmenu.html'),
          peekbar: resolve(__dirname, 'src/renderer/peekbar.html'),
          signin: resolve(__dirname, 'src/renderer/signin.html'),
          extensions: resolve(__dirname, 'src/renderer/extensions.html')
        }
      }
    },
    plugins: [react(), tailwindcss(), Icons({ compiler: 'jsx', jsx: 'react' })]
  }
})
