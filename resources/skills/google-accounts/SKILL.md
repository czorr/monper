---
host: accounts.google.com
name: "Cuentas de Google"
description: IMPORTANT- Read this skill before interacting any Google apps!
autoInject:
  keywords: ["google", "구글", "グーグル", "谷歌"]
---
# Google Accounts

Use the `googleAccounts` global in the REPL tool to discover signed-in Google accounts. Uses cookie-only HTTP — no tab needed.

## Usage

```js
await googleAccounts.print();
```

## Methods

### `googleAccounts.print(): Promise<void>`

Print all signed-in Google accounts to the console. Token-efficient.

### `googleAccounts.list(): Promise<GoogleAccountInfo[]>`

Returns all signed-in Google accounts. Use this when you need programmatic access.

```ts
interface GoogleAccountInfo {
  accountId: number;      // matches Gmail /u/{uid}/
  name: string;
  email: string;
  profileImageUrl: string;
}
```
