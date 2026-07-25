# Las 4 esquinas del page view: reglas que NO hay que romper

Este documento existe porque las esquinas redondeadas se rompieron 4 veces en un día y
la causa final fue una "mejora" que introdujo el defecto que luego perseguimos. Léelo
antes de tocar `Content.tsx`, `CONTENT_RADIUS`, la vibrancy o el color del topbar.

---

## El modelo de capas (de abajo hacia arriba)

```
1. Vibrancy de macOS        ← material translúcido de la ventana
2. DOM del chrome           ← sidebar, topbar, panel de chat (React)
3. WebContentsView          ← la página. SE DIBUJA ENCIMA DEL DOM, siempre.
```

De ahí salen dos consecuencias que gobiernan todo:

- **Nada del DOM puede ir por encima de la página.** Cualquier overlay sobre la web tiene
  que ser una ventana nativa (de ahí `createPopover`).
- **`setBorderRadius` recorta la vista dejando una muesca transparente en cada esquina.**
  Por esa muesca se ve **la capa 2 y, si es transparente, la 1**.

## Las reglas

### 1. El contenedor de `Content` NO lleva fondo

```tsx
<div className={cls}>        ✅ correcto
<div className={cls} style={{ background: '...' }}>   ❌ dibuja "piquitos" en las esquinas
```

**Por qué:** el fondo de esa capa es visible **únicamente** en las cuatro muescas (el resto
lo tapa la página). Ponerle un color opaco pinta una cuña sólida en cada esquina que
contrasta contra la vibrancy: se ve como un piquito gordo, y **solo en las esquinas**,
nunca en los laterales. Ese fue el bug real del 24 jul 2026.

### 2. La franja de costura va SOLO arriba

```tsx
{(leftInset || rightInset) && (
  <div className="absolute left-0 right-0 top-topbar h-4 …" style={{ background: pageColor }} />
)}
```

- Su alto debe ser **≥ `CONTENT_RADIUS`** (radio 14 → `h-4` = 16px).
- Va **solo arriba** para que la costura con el topbar sea invisible.
- Si cubriera todo el contenedor, las muescas de abajo se rellenarían del color de la
  página y **el redondeado inferior deja de verse** (parece cuadrado).

### 3. El color del topbar se muestrea en LA ESQUINA, no promediando

`sampleTopStrip` captura los **24×4 px de la esquina superior izquierda**. Ese color rellena
la muesca superior, así que tiene que coincidir con **ese píxel**, no con el promedio de
toda la franja. Promediar rompe la costura en páginas con degradado, video o carrusel.

### 4. La vibrancy es requisito, no decoración

Las muescas **deben** mostrar el material translúcido. Con la ventana opaca las esquinas
también se ven bien, pero se pierde el look. Mantener:

```ts
{ vibrancy: VIBRANCY, visualEffectState: 'active', backgroundColor: '#00000000' }
```

---

## Cosas ya comprobadas (no re-investigar)

| Hipótesis | Veredicto |
|---|---|
| Es una diferencia de color entre la costura y la página | ❌ **Falso.** Medido: los 4 píxeles, la costura y el fondo todos en `#111114` y el arco seguía. |
| Es el antialiasing del compositor de Chromium | ❌ **Falso.** Era la cuña opaca de la regla 1. |
| Lo causa `view.setBackgroundColor()` | ❌ **Falso.** Ya existía cuando funcionaba bien. |
| Lo causa una extensión instalada | ❌ **Falso.** Las extensiones no tocan la composición nativa. |
| Se puede redondear solo abajo | ❌ **Imposible.** `setBorderRadius(radius: number)` acepta un único valor para las 4 esquinas. |

## Herramienta de diagnóstico

```bash
MONPER_DEBUG_CORNERS=1 pnpm dev
```

Imprime, en cada muestreo, el color que usamos para la costura contra el **píxel real** de
cada esquina:

```
[esquinas] { radio: 14, usadoParaLaCostura: '#111114',
             pixelRealArribaIzq: '#111114', …, coincideArribaIzq: true }
```

- `coincideArribaIzq: false` → el problema es el muestreo.
- `true` y aun así hay artefacto → el problema es una **capa que no debería tener fondo**
  (empieza por la regla 1).

También existe `MONPER_NO_VIBRANCY=1` para aislar si algo es de composición.

## Checklist antes de tocar esto

- [ ] ¿Le estoy poniendo fondo a alguna capa que solo se ve por las muescas? → no lo hagas.
- [ ] ¿Cambié `CONTENT_RADIUS`? → ajusta `rounded-t[l/r]` en `Content.tsx` **y** el alto de la franja.
- [ ] ¿El artefacto es solo en las esquinas? → es una capa con fondo, no el compositor.
- [ ] Antes de teorizar: **`git diff` contra el último estado bueno.** Es lo que faltó y costó 4 intentos.
