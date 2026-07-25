# Rendimiento

Medido, no opinado. El banco está en [`tests/perf.spec.ts`](../tests/perf.spec.ts):

```bash
pnpm test:only tests/perf.spec.ts
```

Imprime medianas por consola. **Guarda los números antes de optimizar algo**; si un cambio
no mueve un número, no es una optimización, es una hipótesis.

## Antes / después (Mac del desarrollo, 2026-07-25)

| | Antes | Después |
|---|---|---|
| Arranque → chrome interactivo | 944 ms | **711 ms** |
| First contentful paint | 252 ms | **228 ms** |
| JS que carga `index.html` | 1149 KB | **263 KB** |
| Memoria de base | 919 MB | **575 MB** |
| Ventanas al arrancar | 4 | **1** |
| Pestaña nueva → activa | 23 ms | 32 ms |
| Cambio de pestaña | 31 ms | 17 ms |
| Navegación (página local) | 71 ms | 119 ms |

Las tres últimas filas están dentro del ruido con n=5: no se toca nada que las explique, y
no se van a presentar como mejoras ni como regresiones.

## Los tres cambios

**1. El build no estaba minificado.** `electron.vite.config.ts` no fijaba `build.minify`, y
salían 10.167 líneas con comentarios y nombres completos. Con `minify: 'esbuild'` en main,
preload y renderer: 607 KB → 263 KB. En paint son ~24 ms, poco; el valor está en el tamaño
(el paquete que se descarga, el disco, la memoria, y máquinas más lentas que esta).

**2. El chrome cargaba el Markdown del chat al arrancar.** `react-markdown` + `remark-gfm` +
micromark son ~547 KB y entraban en el chunk de `index.html`: medio mega de parser de Markdown
para pintar un sidebar y una topbar, en cada arranque. Ahora va en `React.lazy`
([Markdown.tsx](../src/renderer/src/components/chat/Markdown.tsx)), con el texto en plano y la
tipografía final como fallback para que no haya hueco ni salto de layout.

**3. Se pre-creaban tres popovers al arrancar.** site-info, menú de perfil y peek, tres
procesos de renderer vivos desde el primer segundo:

| | Con pre-warm | Sin pre-warm |
|---|---|---|
| Primer abrir | 31 ms | 63 ms |
| Memoria de base | 919 MB | 575 MB |
| Ventanas | 4 | 1 |

344 MB por 32 ms que nadie percibe, una sola vez por popover (después la ventana se reutiliza).
Y el motivo original del pre-warm —que el popover saliera **vacío** en el primer click— era
otro bug, ya resuelto en `createPopover`, que reenvía sus datos en `did-finish-load`.
Verificado: abre con sus 10 filas a la primera.

Hay un test que lo fija: *"al arrancar no hay ninguna ventana de popover"*, con el mensaje
"alguien volvió a pre-crear popovers: mide antes de hacerlo".

## Dos medidas que estaban mal

Las cuento porque un número falso es peor que ninguno:

- **`decodedBodySize` es 0 en `file://`**, así que "JS cargado por el chrome" daba **0 KB**.
  Ahora se suma el tamaño en disco de los chunks que referencia `index.html`.
- **El arranque incluía un reload** que mete el propio harness (`installStateListener`).
  Ahora ese test usa `skipStateListener`, y además se mide el FCP, que aísla nuestro código
  del ~900 ms que tarda Electron en arrancar y que tapaba cualquier mejora.

## Lo que no está medido

- El arranque **empaquetado**, que es el que ve el usuario (aquí se mide el de desarrollo).
- Páginas reales pesadas: todo se mide contra un HTTP local para no depender de la red.
- El streaming del agente y el REPL.
- Percepción: el "flash gris" al cambiar de pestaña es un problema de compositor, no de los
  17 ms que tarda el cambio de estado.
