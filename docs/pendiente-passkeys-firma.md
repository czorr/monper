# Pendiente: passkeys (WebAuthn) + firma de código

El soporte de passkeys ya está **implementado en el código**, pero queda **bloqueado**
hasta tener una cuenta de Apple Developer. Este doc resume qué hay hecho, qué falta y
cómo activarlo cuando tengas el Team ID.

## Estado

| | |
|---|---|
| Código en la app | ✅ hecho — `configurePasskeys()` en [`src/main/index.ts`](../src/main/index.ts) |
| Entitlements | ✅ hecho — [`build/entitlements.mac.plist`](../build/entitlements.mac.plist) |
| Apple Team ID | ❌ **falta** (no lo tenemos aún) |
| Config de empaquetado/firma | ❌ **falta** (no hay electron-builder/forge en el repo) |

Hoy, al arrancar, el main loguea:

```
[passkeys] MONPER_TEAM_ID no definido: passkeys deshabilitados (requiere firma con entitlement).
```

…y la app sigue funcionando normal (sin passkeys). No crashea.

## Por qué no funcionan todavía

Electron **no habilita el autenticador de plataforma por defecto**: hasta llamar a
`app.configureWebAuthn(...)`, `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
devuelve `false` y los sitios ni siquiera ofrecen la opción de passkey.

Ya hacemos esa llamada, pero macOS exige que el **keychain access group** usado
(`<TEAM_ID>.com.monper.app.webauthn`) esté declarado en el entitlement
`keychain-access-groups` de una app **firmada** con ese Team ID. En desarrollo, el
binario de Electron no lleva nuestro entitlement, así que no aplica.

## Qué hacer cuando tengas el Team ID

1. **Definir el Team ID** (10 caracteres, del portal de Apple Developer):
   ```bash
   export MONPER_TEAM_ID=XXXXXXXXXX
   ```
   Conviene moverlo a `.env` / la config de build para no depender del shell.

2. **Verificar el bundle id.** El código usa `BUNDLE_ID = 'com.monper.app'`
   (en `src/main/index.ts`). Debe coincidir con el `appId` del empaquetador y con el
   entitlement.

3. **Agregar empaquetado + firma** (no existe todavía). Con `electron-builder`, algo así:
   ```yaml
   appId: com.monper.app
   productName: Monper
   mac:
     hardenedRuntime: true
     entitlements: build/entitlements.mac.plist
     entitlementsInherit: build/entitlements.mac.plist
   ```
   `$(AppIdentifierPrefix)` en el plist se resuelve al Team ID al firmar; si tu
   herramienta no lo expande, escribe el Team ID literal.

4. **Probar en la app firmada** (no en `dev`): abrir un sitio con passkeys
   (p. ej. github.com, google.com) y verificar que aparece el prompt de Touch ID.
   En consola debe verse `[passkeys] Touch ID habilitado para WebAuthn.`

## Limitaciones a tener en cuenta

- Las passkeys de Touch ID son **device-bound**: **no** se sincronizan por iCloud Keychain.
- Requieren Mac con **Secure Enclave** (Apple Silicon, o Intel con chip T2).
- Solo aplica a **macOS** (`@platform darwin`). Windows/Linux necesitarían otra ruta.

## Archivos involucrados

- `src/main/index.ts` → `configurePasskeys()` y `BUNDLE_ID`
- `build/entitlements.mac.plist` → `keychain-access-groups`
