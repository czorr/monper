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

---

## Páginas internas translúcidas

Nuestras páginas (newtab, settings, downloads, error) se dibujan sobre la vibrancy, igual que
el sidebar y el chat. Una web NO: la transparencia es del producto, no algo que se le concede
a cualquier sitio que cargues.

Son **cuatro piezas y van juntas**. Quitar una deja un fallo visual que no parece venir de ahí:

1. **`applyBackdrop(t)`** pone el fondo de la vista a `#00000000` si `isInternal(t.url)`, y a
   `APP_BG` si no. Se llama **en cada `did-navigate`**, no al crear la vista: una pestaña
   cruza la frontera en los dos sentidos (newtab → web → newtab).
2. **`.page-backdrop`** (en `styles.css`) sustituye a `bg-bg` en los cuatro roots internos.
   Es `--color-bg` al 62% — ese alpha es el mando de cuánta transparencia. Si esto vuelve a
   ser opaco, la transparencia de la vista no se nota; si la vista recupera fondo, esto se ve
   gris sucio sobre negro.
3. **`pageColor: 'transparent'`** para esas pestañas, y `sampleTopStrip`/`applyTopColor` salen
   temprano. Dos razones distintas:
   - la **franja de costura** (regla 2) vive DEBAJO de la página; con la página translúcida se
     vería entera, como una banda opaca de 16px bajo el topbar, en vez de solo por las muescas;
   - `applyTopColor` le pone a la vista el color muestreado **como fondo opaco**, así que al
     primer scroll deshacía la transparencia.
4. **Solo la activa se dibuja** (`layoutTabs`). Antes el warm set dejaba renderizando hasta 8
   vistas **apiladas en el mismo rect**, cosa inofensiva solo mientras la de encima fuese
   opaca y ya hubiese pintado. Ninguna de las dos se cumple siempre — ver abajo.

   No cuesta nada medible: el primer frame tarda 2-10ms venga del warm set o esté fría (ver
   [rendimiento.md](rendimiento.md)). El warm set nunca compró velocidad de pintado; solo
   hacía renderizar 8 vistas a la vez. `warmOrder` se mantiene porque es el LRU que necesita
   el descarte de pestañas (punto 11 de [browser-hardening.md](browser-hardening.md)).

### El mismo bug dos veces, y por qué la primera solución era mala

Primero se vio con **settings sobre la new tab**, y se acotó a "si la activa es translúcida,
que se quede sola". Volvió a los dos días disfrazado: **abrir un marcador desde settings**
mostraba la new tab durante medio segundo. Parecía que el marcador pasaba por la new tab page,
y no: medido, su URL es la definitiva desde el ms 0 — "Nueva pestaña" es solo el título por
defecto hasta que llega el de la página. Lo que pasaba es que al activarse una pestaña
**opaca**, la excepción se apagaba y las 4 vistas volvían a ser visibles de golpe, mientras la
nueva aún no había pintado su primer frame (~80ms).

La lección: la condición correcta no era *"¿puede taparlas?"* sino *"no hay razón para
dibujarlas"*. Acotar la excepción al caso conocido dejó vivo el mecanismo, y el mecanismo
volvió por otro lado.

### La trampa del `luminance`

`luminance('transparent')` no matcheaba ningún patrón, caía al blanco por defecto y devolvía
**1**. Con eso el topbar entraba en modo `on-light` y ponía texto e iconos **oscuros** justo
donde el fondo es la vibrancy oscura: invisibles. `transparent` no es un color claro, es la
ausencia de color. Arreglado en la función y en el topbar.

Lo fijan `tests/branding.spec.ts` ("el topbar va en claro sobre la vibrancy") y
`tests/layout.spec.ts` ("no queda ninguna otra vista visible detrás").

---

## `setBorderRadius` instala una máscara CON UN TAMAÑO

Regla nueva, y es la que faltaba en este documento:

> **El recorte de `setBorderRadius` se instala con el tamaño que la vista tiene en ese
> momento. Si la vista cambia de tamaño y no se reaplica, sigue recortando al tamaño viejo.**

Eso causó un bug que se persiguió durante días: al redimensionar el panel de chat y cerrarlo,
quedaba un hueco a la derecha con el ancho exacto del chat. Tres señales lo delataban y las
tres apuntaban aquí una vez sabes esto:

- **Persistente.** Reabrir y cerrar el chat no lo quitaba. Un frame perdido lo arregla el
  siguiente repintado; una máscara puesta, no.
- **Recortaba, no reflowaba.** El titular de GitHub salía partido a media palabra. Si la
  página se hubiera quedado con el ancho viejo, habría re-maquetado el texto.
- **Todo el estado era correcto.** El rect calculado, los bounds reales de la vista y el
  `innerWidth` de la página. Por eso `MONPER_DEBUG_LAYOUT` decía `libre=0` mientras se veía
  el hueco: el estado estaba bien y lo que mentía era el recorte.

La secuencia exacta: con el sidebar colapsado se abre el chat (radio 0 → 14, sellado al ancho
de entonces), se arrastra (el radio no cambia, **la máscara no se toca**), y al cerrar el chat
el radio pasa a 14 → 0 y se sella *mientras la vista todavía es estrecha*, justo antes de que
la animación la ensanche. La máscara se queda 640px corta.

### Cómo se confirmó

`MONPER_NO_RADIUS=1` (flag de diagnóstico, sigue en el repo): sin redondeo, el hueco no
aparece. Con eso confirmado se pudo medir en test, instrumentando `setBorderRadius` para
apuntar el ancho de cada llamada: **6/6 vueltas con la máscara a 1020 y la vista a 1660 antes
del arreglo, 0/6 después**.

Las dos hipótesis anteriores —un frame no presentado (se probó `webContents.invalidate()`) y
las vistas ocultas sin superficie de GPU— **eran falsas**. La segunda dejó un cambio bueno por
otro motivo (ver abajo), pero ninguna era la causa.

### Corrección: reinstalar la máscara NO bastaba

Lo de abajo se escribió creyendo que el resellado cerraba el caso. **No lo cerró**, y lo que
faltaba lo aisló el usuario: el hueco aparecía **solo con los dos sidebars colapsados**, que es
el único estado en que el radio objetivo es **0**. Con uno abierto (radio 14) nunca pasaba.

> **`setBorderRadius(0)` no desinstala la máscara anterior: la deja puesta, con su tamaño.**

Cuadra con los números: la última máscara de radio 14 se había instalado a `w=1261` y la
página se cortaba exactamente ahí. Y con el log se vio que el resellado **sí** corría, sobre la
vista activa, al ancho final (`[resellado] ... w=1660`) y aun así el hueco seguía — porque
resellar a 0 no reinstala nada. `MONPER_NO_RADIUS=1`, que no llama nunca a `setBorderRadius`,
sí lo hacía desaparecer: la máscara que no existe no recorta.

**El arreglo real: no pedir nunca 0.** `SIN_REDONDEO = 1`. Un píxel de radio no se ve, y con
radio > 0 la máscara sí se reinstala al tamaño nuevo. El paso intermedio del resellado forzado
también evita el 0 (usa `r + 1`) por el mismo motivo. Lo fija `tests/layout.spec.ts` →
"nunca se pide radio 0".

El resellado se queda: hace falta igualmente para que la máscara siga al tamaño durante un
arrastre. Simplemente no era suficiente por sí solo.

### El arreglo parcial, y por qué no contradice la regla del `if`

`applyRadius` sigue reaplicando **solo cuando cambia el radio**: reaplicarlo en cada layout es
lo que trae de vuelta las muescas, y eso no se toca. Lo que se añade es `resellarRadioAlAsentarse()`,
con debounce de 80ms y solo sobre la vista activa: cuando el tamaño deja de cambiar, si el
ancho actual no coincide con el ancho al que se selló la máscara, se reinstala. Una vez por
interacción, no una por frame.

Cada `Tab` guarda ahora `radiusW`, el ancho con el que se instaló su máscara. Si alguna vez se
llama a `setBorderRadius` sin pasar por `sellarRadio`, ese dato miente y el bug vuelve.

Lo fija `tests/layout.spec.ts` → "la máscara del redondeado se reinstala al cambiar el tamaño".

### De paso: las vistas ocultas ya no siguen el layout

Persiguiendo esto salió en los logs `SharedImageManager::ProduceSkia: Trying to Produce a Skia
representation from a non-existent mailbox`. No era la causa del hueco, pero sí una
incoherencia real: al ocultar las vistas no activas, Chromium libera sus superficies de GPU, y
`layoutTabs` les seguía haciendo `setBounds` a 60fps durante los arrastres. Ahora una vista
oculta está aparcada del todo —ni se dibuja ni se redimensiona— y recibe su tamaño al
activarse. `animateLayout` anima solo la activa por lo mismo.
