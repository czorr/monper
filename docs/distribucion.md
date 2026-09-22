# Distribución de Titanio

Cómo empaquetar, firmar y publicar. Configuración en [`electron-builder.yml`](../electron-builder.yml).

---

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dist:dir` | Solo la `.app` en `release/mac-arm64/`. Rápido, para verificar que empaqueta. |
| `pnpm dist:mac` | DMG + ZIP para arm64 + x64. El **ZIP no es opcional**: electron-updater no sabe actualizar desde un DMG. |
| `pnpm dist` | Todos los targets del `.yml`. |

Sin cuenta de Apple, añade `CSC_IDENTITY_AUTO_DISCOVERY=false` para saltar la firma:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm dist:dir --mac --arm64
```

## Estado actual

| | |
|---|---|
| Empaqueta | ✅ verificado — `.app` de 333 MB (arm64) |
| Skills incluidas | ✅ en `Contents/Resources/skills` |
| Dependencias de runtime | ✅ `electron-updater`, `@ai-sdk/*`, `@mastra/core` dentro del asar |
| Auto-update (código) | ✅ implementado |
| **Firma** | ❌ **falta cuenta de Apple Developer** |
| **Notarización** | ❌ idem |
| **Release publicada** | ❌ nunca se ha publicado |

## Lo que falta para que alguien más lo instale

1. **Cuenta de Apple Developer** ($99/año). Sin ella:
   - macOS muestra "no se puede abrir porque es de un desarrollador no identificado".
     El usuario puede saltarlo con click derecho → Abrir, pero es una fricción brutal.
   - **El auto-update no puede instalar** en macOS: exige app firmada.
   - Las passkeys siguen bloqueadas (ver [pendiente-passkeys-firma.md](pendiente-passkeys-firma.md)).

2. **Variables para firmar y notarizar:**
   ```bash
   export CSC_LINK=/ruta/certificado.p12      # Developer ID Application
   export CSC_KEY_PASSWORD=…
   export APPLE_ID=…
   export APPLE_APP_SPECIFIC_PASSWORD=…
   export APPLE_TEAM_ID=…                     # también sirve para MONPER_TEAM_ID
   ```

3. **Publicar la release:** `GH_TOKEN=… pnpm dist --publish always`
   El `publish` del `.yml` apunta a `github.com/czorr/titanio`. electron-updater lee
   ese mismo origen, así que en cuanto haya una release con el `latest-mac.yml`
   las actualizaciones empiezan a funcionar.

## Probar el update sin cuenta de Apple ni release

Hay un servidor de feed local que genera un `latest-mac.yml` válido (con sha512 y tamaño
reales, que electron-updater **verifica**). Permite comprobar detección → descarga con
progreso → verificación de integridad:

```bash
# Terminal 1
node scripts/fake-update-server.mjs --version 0.3.0

# Terminal 2 (en dev, o sobre la .app empaquetada)
MONPER_UPDATE_FEED=http://localhost:8788 pnpm dev
```

La app tiene la `0.2.0`, el feed ofrece la `0.3.0` → aparece el pill. Al hacer click
descarga de verdad (8 MB de relleno) con su porcentaje.

Dos trampas que ya nos costaron una vuelta, por si se toca esto:

- **`forceDevUpdateConfig` relee `dev-app-update.yml` del disco al descargar** e ignora el
  `setFeedURL`. Por eso `updater.ts` **escribe** ese archivo cuando hay `MONPER_UPDATE_FEED`.
  Sin él, el check encuentra la versión y la descarga muere con `ENOENT`.
- **El ZIP de relleno tiene que ser un ZIP válido.** electron-updater lo descomprime en
  cuanto acaba la descarga; bytes al azar fallan ahí y parece que se rompió la descarga.

Para probar con un ZIP real: `pnpm dist:mac` y luego
`node scripts/fake-update-server.mjs --zip release/Titanio-0.2.0-arm64-mac.zip --version 0.3.0`.

**Qué NO prueba:** la instalación. `quitAndInstall` necesita app **firmada** en macOS y
fallará sin ella. Todo lo demás sí queda verificado.

Y para ver solo la UI, sin servidor: `MONPER_FAKE_UPDATE=1 pnpm dev`.

## Cómo funciona el auto-update

[`src/main/updater.ts`](../src/main/updater.ts):

- **Silencioso al arrancar**: comprueba, descarga en segundo plano y **notifica** cuando
  está lista; se instala al cerrar (o al hacer click en la notificación). Si no hay red,
  ni releases, ni firma, no molesta.
- **Re-comprueba cada 6 h** para sesiones largas.
- **Manual**: menú *Titanio → Buscar actualizaciones…*, que sí da feedback siempre
  (incluso "estás al día"), y en dev avisa de que solo funciona empaquetado.
- `electron-updater` se importa de forma **dinámica y solo si `app.isPackaged`**: en
  desarrollo no se carga.

## Notas de empaquetado

- **`extraResources`** copia `resources/skills` → `Contents/Resources/skills`, que es de
  donde las lee `skills.ts` cuando `app.isPackaged`.
- **`extendInfo`** declara `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` y
  `NSLocationWhenInUseUsageDescription`. **No es opcional**: macOS mata el proceso al
  primer uso de cámara/micrófono si falta el motivo, y esos permisos los piden las webs.
- **`hardenedRuntime` + `entitlements`** apuntan a `build/entitlements.mac.plist`
  (JIT de V8 y el keychain group de las passkeys).
- Aviso conocido de electron-builder: `cannot find path for dependency @ai-sdk/provider-v5/v6/v7`.
  Son **aliases de pnpm** que `@mastra/core` declara pero **no usa en runtime**
  (solo aparecen en source maps). Verificado: inocuo.
- `titaniowright` no se empaqueta aparte: vite lo inlinea en el bundle del main.

## Versionado

**Semver, pre-1.0**: mientras el primer número sea `0`, la segunda cifra sube con cada tanda de
novedades y la tercera solo con arreglos. La `1.0.0` es la primera que se pueda instalar de
verdad: firmada, notarizada y actualizándose sola.

Cada versión lleva su **tag** (`v0.2.0`) y su entrada en [CHANGELOG.md](../CHANGELOG.md).

Subir la `version` de `package.json` **es parte de publicar, no un trámite posterior**: es el
número que compara electron-updater, así que un build con la versión vieja no se ofrece como
actualización a nadie — y no avisa de nada, simplemente no pasa. La `0.1.0` se quedó puesta 123
commits por esto mismo.

## Antes de publicar la primera versión

- [x] Subir la `version` en `package.json` (`0.2.0`).
- [ ] Firmar + notarizar.
- [ ] Probar el DMG en una máquina limpia (o con otro usuario de macOS).
- [ ] Publicar y verificar que un build viejo se actualiza al nuevo.
