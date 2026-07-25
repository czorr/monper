# Fallos silenciosos

Había **34 `catch { /* noop */ }`** en el código. Hoy quedan 0.

No era limpieza cosmética: casi todo lo que nos ha costado tiempo depurando era un fallo que
no se veía. El pill de actualización volvía a "Actualizar" tragándose el error; el `ENOENT`
del feed no llegaba a ninguna parte; un `blur` que no hacía nada pasó por arreglo hasta que
se midió. Un `catch` vacío es esa misma trampa, multiplicada.

## La regla

Un `catch` puede no hacer nada solo si **el fallo no cambia lo que el usuario ve**. Y aun
así hay que escribir por qué, en el propio `catch`:

```ts
try { wc.close() } catch { /* ya destruida */ }
```

Si el fallo **sí** cambia algo, hay tres niveles y se elige el más bajo que sirva:

| | Cuándo | Cómo |
|---|---|---|
| `console.error` con etiqueta | El usuario no lo pidió explícitamente, pero algo no pasó | `[estado]`, `[ext]`, `[permisos]`, `[vault]` |
| Estado visible en la UI | El usuario hizo algo y espera respuesta | el pill de update en ámbar, el aviso del avatar |
| Diálogo nativo | Se perdió algo que el usuario cree guardado | fallos del vault, borrar datos del sitio |

Lo que **no** vale: dejar la UI diciendo que salió bien.

## Lo que se arregló, no solo se anotó

**El vault guardaba items sin secreto.** `encrypt()` devolvía `null` si el llavero del
sistema no estaba disponible y el item se guardaba igual. Metías tu API key, la veías en la
lista, y luego todos los chats fallaban con un error de auth sin relación aparente. Lo mismo
con una contraseña: aparecía guardada y no rellenaba nada.
Ahora `add`/`update` **deshacen el item y lanzan `VaultError`**, y los tres sitios que llaman
lo muestran en un diálogo nativo. Un item sin secreto es una trampa; mejor que no exista.

**El interruptor de una extensión se quedaba en ON con la extensión muerta.** Si
`loadExtension` fallaba, se marcaba `enabled = true` de todas formas. Ahora se queda en OFF y
el motivo va al log — parte del misterio de "no funciona el adblock" era esto.

**Los 14 JSON de estado se escribían sin red.** Marcadores, vault, API keys, historial,
permisos, sesión… todos con `writeFileSync` en un `try` vacío. Si el disco fallaba, el
usuario perdía datos y no había ni una línea en ningún log.
Ahora pasan por [`jsonfile.ts`](../src/main/jsonfile.ts): dice qué se perdió y por qué, y
**escribe de forma atómica** (`.tmp` + `rename`) para que un cierre a mitad de escritura no
deje el JSON truncado. Eso convertía "no se guardó lo último" en "se perdió el fichero
entero", porque al arrancar el parse falla y se cae al valor por defecto.

**Un fichero corrupto se descartaba en silencio.** `catch { items = [] }` es indistinguible
de "el usuario no tenía nada". `readJson` distingue los dos casos: si no existe, calla; si
existe y no se puede leer, avisa.

**La migración de proveedores de IA podía reventar entera** por un solo proveedor cuya key
no se pudiera descifrar del formato antiguo. Ahora se salta ese y migra el resto.

Y menores: el toggle de permisos que no se aplicaba (el interruptor vuelve solo a su sitio,
porque se reenvía el estado real), "borrar datos del sitio" fallando sin decirlo, el avatar
que no se cambiaba sin explicar por qué, y el listado de cuentas de Google.

## Tests

En `tests/state.spec.ts`:

- **un fichero de estado corrupto no impide arrancar** — se escribe basura en
  `bookmarks.json` y se comprueba que la app abre y cae a los marcadores por defecto.
- **la escritura de estado es atómica** — no queda ningún `.tmp` tras guardar.

Lo que no está cubierto: forzar un fallo de disco de verdad, y el camino del `VaultError`
(haría falta un `safeStorage` no disponible). Ambos verificados solo por lectura.
