# Titanio Vault — Arquitectura

> Almacén único y cifrado para **todos** los secretos del usuario: API keys de IA,
> credenciales web (logins de sitios), tokens de servicios/MCP y secretos genéricos.
> Diseñado para que **ni el renderer ni el modelo de IA vean nunca un secreto en claro**.

## 1. Principios

1. **El vault vive solo en el proceso `main`.** El renderer (chrome) y las páginas de
   contenido reciben **metadata**, jamás el secreto.
2. **Cifrado en reposo con `safeStorage`** (keychain del SO). Sin passphrase extra por
   ahora (decisión tomada); la abstracción permite añadirla luego.
3. **El secreto lo usa `main` en nombre del usuario/agente**, no el modelo:
   - API keys → `main` hace la llamada al proveedor.
   - Credenciales web → `main` inyecta usuario/clave en el `<input>` de la página.
   - Tokens de servicio → `main` los adjunta a la llamada de la herramienta.
4. **El agente puede *pedir* una acción** ("logueame en X"), pero la inyección del
   secreto ocurre en `main`, fuera de la vista del modelo. (Igual que el Password
   Manager de Aside: "the password stays hidden from the AI agent".)
5. **Validación de origen**: los IPC de gestión solo aceptan páginas internas (Settings).

## 2. Modelo de datos

Un ítem del vault = **metadata pública** + **secreto cifrado** (separados).

```ts
type VaultItemType = 'ai-key' | 'web-credential' | 'service-token' | 'secret'

interface VaultItemMeta {
  id: string
  type: VaultItemType
  label: string
  createdAt: number
  updatedAt: number
  data: Record<string, string>   // metadata NO-secreta, específica del tipo
}
```

Metadata por tipo (`data`):

| type             | `data` (no-secreto)                          | secreto        |
| ---------------- | -------------------------------------------- | -------------- |
| `ai-key`         | `{ kind: 'anthropic'|'openai', baseUrl? }`   | la API key     |
| `web-credential` | `{ origin, username }`                       | el password    |
| `service-token`  | `{ service: 'github'|'linear'|…, account? }` | el token       |
| `secret`         | `{ name }`                                   | el valor       |

## 3. Almacenamiento (dos archivos en `userData`)

- **`vault.json`** — array de `VaultItemMeta`. **Legible/inspeccionable** (no hay secretos aquí).
- **`vault.secrets.json`** — mapa `{ [id]: base64(encrypted) }`. Blobs opacos de `safeStorage`.

Separarlos garantiza que la metadata sea auditable y que un secreto nunca se serialice
por accidente junto a UI/estado. Descifrado **on-demand** (solo al momento de usarlo),
nunca se mantiene el texto plano en memoria más de lo necesario.

**Fallback si `safeStorage` no está disponible**: se rechaza el guardado con aviso (no
guardar en claro). En macOS firmado/dev normalmente está disponible.

## 4. API pública (módulo `main/vault`)

**Gestión** (expuesta a páginas internas vía IPC, sender-validada):
```ts
vault.list(): VaultItemMeta[]
vault.add(type, label, data, secret): VaultItemMeta
vault.update(id, patch: { label?, data?, secret? }): VaultItemMeta
vault.remove(id): void
```

**Consumo** (solo `main`, nunca cruza a renderer como texto):
```ts
vault.getSecret(id): string | null          // uso interno
vault.findCredential(origin): VaultItemMeta  // por sitio
vault.itemsByType(type): VaultItemMeta[]
```

El renderer **solo** recibe `VaultItemMeta` (labels, tipo, username, kind…), nunca el secreto.
Los inputs de secreto en la UI son **write-only** (campo password; no se re-muestra tras guardar).

## 5. Flujos de consumo

### 5.1 API keys de IA (ya existe, se migra al vault)
`ai-key` items alimentan la capa de proveedores. El "proveedor activo", modelo y effort
son **chat settings** (config, no secretos) y viven aparte (`ai.json` o similar).

### 5.2 Autofill de credenciales web
1. `main` detecta el form de login en la pestaña activa (heurística: `input[type=password]`
   + campo de usuario).
2. Busca `web-credential` por `origin`.
3. Ante acción del usuario **o** petición del agente + **confirmación**, `main` inyecta
   valores vía `executeJavaScript` en la `WebContentsView` (set value + `input` events).
   → El password va de `main` → página, **sin pasar por el modelo**.

### 5.3 Tokens de servicio / MCP
Herramientas del agente (`use_github`, `use_linear`…) piden a `main` que adjunte el token
a la llamada saliente. El modelo solo sabe "existe token para el servicio X".

## 6. Integración con el agente (herramientas)

El agente nunca recibe secretos; recibe **capacidades**:
```
fill_login(origin)      → main resuelve credential + inyecta → { ok }
use_token(service)      → main adjunta token a la request → { ok }
list_available_logins() → devuelve orígenes/usuarios (sin passwords)
```
Acciones sensibles (usar credenciales, enviar) pasan por el gating de confirmación.

## 7. Boundary de seguridad (resumen)

| Superficie            | Qué ve                                    |
| --------------------- | ----------------------------------------- |
| Reposo (disco)        | Cifrado con keychain del SO               |
| Renderer / IPC        | Solo metadata (nunca el secreto)          |
| Modelo de IA / agente | Solo capacidades (nunca el secreto)       |
| `main`                | Descifra on-demand para usar el secreto   |

## 8. Estructura de archivos propuesta

```
src/shared/vault.ts          # tipos de metadata compartidos (sin secretos)
src/main/vault/
  store.ts                   # load/save meta + secretos cifrados (safeStorage)
  index.ts                   # API pública: list/add/update/remove/getSecret
  autofill.ts                # inyección de credenciales en la WebContentsView
```

La capa de IA actual (`src/main/ai/store.ts`) se refactoriza para leer sus keys del vault
(`itemsByType('ai-key')`), manteniendo las chat settings (activo/modelo/effort) separadas.

## 9. UI (Settings)

Secciones dentro de Settings, cada una operando sobre el vault:
- **AI** → `ai-key` (la que ya existe, formalizada).
- **Passwords** → `web-credential` (origin + usuario; password write-only).
- **Tokens** → `service-token`.
- **Secrets** → `secret` genéricos.

Cada fila muestra metadata + quitar; el alta pide el secreto una sola vez.

## 10. Migración

`ai.json` actual → los proveedores con clave se migran a items `ai-key` del vault en el
primer arranque; `activeId`/`model`/`effort` quedan como chat settings.

---

### Fases de implementación sugeridas
1. **Core del vault** (`store.ts` + `index.ts` + tipos) con `safeStorage` y los 2 archivos.
2. **Migrar la capa de IA** a leer keys del vault (sin cambiar UX del chat).
3. **UI de Passwords/Tokens/Secrets** en Settings.
4. **Autofill** de credenciales web (inyección + matching por origin).
5. **Herramientas del agente** para usar credenciales/tokens con gating.

## Settings → Password (la pantalla del vault)

Hasta que existió, al vault solo se llegaba por el candado del topbar: un popover para rellenar
rápido, no para ver qué tienes guardado, renombrarlo ni limpiarlo. El importador ya traía las
contraseñas de Chrome y **desaparecían en un cajón sin puerta**.

### Ver la contraseña: la única excepción al principio 1

Al principio esta pantalla **no** dejaba ver el secreto, precisamente por el principio 1. Se
cambió por decisión de producto, a sabiendas: **un gestor de contraseñas en el que no puedes
mirar tu propia contraseña no es un gestor.** Queda como la ÚNICA excepción, y acotada:

- `vault:reveal` va **de una en una y solo al pulsar**. No existe ningún canal que vuelque el
  vault entero — el listado sigue sin llevar secretos, y eso es lo que impide un escape
  accidental. Hay tests que lo afirman.
- Lleva `isInternalSender`, como borrar o editar.
- **Nunca se registra.** Un `console.log` ahí dejaría la contraseña en disco para siempre.
- El renderer la tapa sola a los 15 s.
- **El agente sigue sin verla**: el canal vive en el preload de páginas internas, al que el
  modelo no tiene acceso. Lo que cambia es qué puede ver el USUARIO, no el modelo.

Copiar (`vault:copy`) se queda y sigue siendo la vía recomendada: descifra **en el main** y
escribe directo en el portapapeles, así el valor ni siquiera entra en el DOM.

- El portapapeles **se limpia solo a los 30 s**, y solo si sigue conteniendo lo que copiamos —
  si el usuario copió otra cosa mientras tanto, vaciarlo le destruiría su portapapeles.
- Editar permite cambiar nombre, sitio, usuario y el valor guardado. Para tokens también
  servicio y cuenta; para secretos genéricos, su identificador. El campo de reemplazo empieza
  vacío y dejarlo así conserva el secreto actual: nunca se precarga la contraseña en el editor.
  Esto actualiza el vault, no la contraseña ni el token en el servicio. Los errores de guardado
  mantienen el formulario abierto y muestran el motivo.
- Los `••••••••` de cada fila son decorativos y de longitud fija a propósito: pintar la longitud
  real filtraría cuánto mide la contraseña a quien mire la pantalla de lejos. Al revelarla se
  pinta **monoespaciada**: una proporcional confunde `l` con `1` y `O` con `0` justo cuando más
  caro sale.
- El icono de cada credencial es el **favicon real** del sitio, de la caché local de sitios
  visitados. Nunca se le pide a un tercero: mandarle a Google la lista de dominios donde el
  usuario tiene cuenta sería lo contrario de lo que promete este panel. Va por un canal aparte
  (`vault:favicons`) y no dentro de `data`, que es lo que se persiste.
- **Alta manual** (`Añadir`): lo normal es que una credencial entre sola al hacer login, pero
  hay dos casos en que no —sitios que no disparan la captura, y todo lo que no es un login—.
  Sin ella el vault solo se llenaba por accidente. El sitio **se normaliza a un origen**
  (`github.com` → `https://github.com`): `findCredential` busca por origen exacto, así que
  guardarlo a medias crea una credencial que no va a coincidir nunca, y eso es un fallo
  silencioso. Las API keys **no** se dan de alta aquí: se guardan solas al conectar un proveedor
  y duplicarlas dejaría dos fuentes de verdad.
- Las cuatro acciones de una fila aparecen **juntas al hover**, como en el gestor de marcadores.
  Tener ojo y copiar siempre visibles y editar/borrar solo al hover eran dos reglas distintas en
  la misma fila. Excepción: con la contraseña a la vista no se esconden, o no habría forma de
  volver a taparla salvo esperar los 15 s.
- `vault:copy`, `vault:update` y `vault:available` llevan `isInternalSender`, como el resto de
  la gestión. El chrome no tiene siquiera el método en su preload, y hay un test que lo afirma.

## Cuentas, importación y edición

- Alta, importación y edición comparten `normalizeCredentialOrigin`: solo HTTP/HTTPS, sin
  rutas ni credenciales embebidas. Al arrancar se migran los antiguos `data.url` a `data.origin`,
  conservando ids y secretos. Los registros con sitios inválidos se conservan para editarlos.
- La identidad de una cuenta es sitio + usuario (se recortan espacios, no se cambia el casing).
  Se admite el alias `www`, pero no se mezclan protocolos, puertos ni otros subdominios.
- Reimportar una cuenta existente no sobrescribe su contraseña. Un registro inválido no
  interrumpe el resto de la importación y aparece en el resumen de errores.
- La captura actualiza solo la cuenta cuyo usuario coincide; no el primer registro del sitio.
  Sin usuario solo coincide con una cuenta guardada sin usuario.
- El agente debe indicar id o usuario cuando hay varias cuentas. El autorrelleno valida que
  el registro sea una credencial web del sitio actual, también cuando se elige por id.
- Regresiones comprobables sin abrir Electron:
  `node --experimental-vm-modules --test tests/vault-unit.cjs`.
