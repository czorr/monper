# Monper Vault — Arquitectura

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
