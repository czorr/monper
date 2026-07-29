# Passkeys (WebAuthn) y firma de código

**Estado: passkeys firmadas, para uso local.** Este doc decía que estaba bloqueado por "no
tener cuenta de Apple Developer". Era falso: el llavero ya tenía dos certificados
`Apple Development` válidos. El Team ID que supuestamente faltaba estaba ahí desde el
principio; lo que no existía era la conexión con el build.

Lección para la próxima: antes de anotar algo como bloqueado por una dependencia externa,
comprobar que de verdad falta — `security find-identity -v -p codesigning`.

## Estado

| | |
|---|---|
| Código en la app | ✅ `configurePasskeys()` en [`src/main/index.ts`](../src/main/index.ts) |
| Entitlements | ✅ [`build/entitlements.mac.plist`](../build/entitlements.mac.plist) |
| Team ID | ✅ `MRWANXY92L` (personal) |
| Firma local | ✅ `identity` en [`electron-builder.yml`](../electron-builder.yml) |
| Notarizar y distribuir | ❌ pide `Developer ID Application` (cuenta de pago) |

## Qué se puede y qué no con un certificado "Apple Development"

Se **puede**: firmar, ejecutar la app en este Mac y que macOS conceda el entitlement
`keychain-access-groups` — que es lo único que las passkeys necesitan.

No se **puede**: notarizar. Sin notarización la app abre aquí, pero en otro Mac Gatekeeper la
bloquea. Para distribuir hace falta `Developer ID Application`, y eso sí requiere el Apple
Developer Program de pago. O sea: **las passkeys en local nunca dependieron de pagar**;
distribuir sí.

## Las tres piezas tienen que coincidir

El Team ID aparece en tres sitios, y si no cuadran macOS falla **en silencio**: no hay error,
simplemente los sitios dejan de ofrecer passkey.

1. `TEAM_ID` en `src/main/index.ts` → forma el `keychainAccessGroup`.
2. `keychain-access-groups` en `build/entitlements.mac.plist`.
3. La `identity` de `electron-builder.yml`, cuyo equipo debe ser el mismo.

Dos trampas dentro de esto:

- **`$(AppIdentifierPrefix)` no vale aquí.** Esa variable solo la expanden las herramientas de
  Xcode; electron-builder la firma literal y deja un grupo inválido. El Team ID va escrito.
- **El Team ID no puede venir solo de `process.env`.** Una app empaquetada no hereda el
  entorno del shell, así que leerlo de `MONPER_TEAM_ID` hacía que las passkeys funcionaran
  lanzando desde terminal y no al abrir desde el Dock. Ahora es constante; la variable solo
  sirve para forzar otro equipo al probar.

## En desarrollo no se configuran, a propósito

`pnpm dev` corre el binario de Electron, que no lleva nuestro entitlement.
`configurePasskeys()` **no llama** a `app.configureWebAuthn` ahí, y no es pereza: pedirle a
Chromium un autenticador de plataforma que no puede abrir el llavero deja WebAuthn peor que
ausente — roto en vez de simplemente no disponible. El log lo dice:

```
[passkeys] en desarrollo no se configuran (la app no está firmada). Prueba en el build firmado.
```

## Cómo comprobarlo

Lanzar el build firmado desde terminal, que es donde se ve el log:

```bash
./release/mac-arm64/Monper.app/Contents/MacOS/Monper
```

Debe aparecer `[passkeys] Touch ID habilitado para WebAuthn.` Después, en la consola de
cualquier página:

```js
PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()  // true
```

Y para verificar la firma sin ejecutar nada:

```bash
codesign -dv release/mac-arm64/Monper.app                      # TeamIdentifier=MRWANXY92L
codesign -d --entitlements - --xml release/mac-arm64/Monper.app # el grupo del llavero
```

## Limitaciones que siguen

- Las passkeys de Touch ID son **device-bound**: no se sincronizan por iCloud Keychain.
- Requieren Secure Enclave (Apple Silicon, o Intel con T2).
- Solo macOS. Windows/Linux necesitan otra ruta.
- El certificado **caduca el 17 de abril de 2027**; al renovarlo, comprobar que el Team ID
  sigue siendo el mismo.

## Qué identidad usar

Se firma con el equipo **personal** (`MRWANXY92L`). El llavero tiene también uno de
organización (`NSMK2YAHUW`, AI Founders Inc.) que **no** se usa: Monper no es un proyecto de
empresa.
