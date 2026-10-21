# @binopartner/pay-sdk

Embed the Binodex deposit and withdrawal widget in a broker site. The SDK gives you a root component and composable parts for React, and a `mount()` function for any other stack. The payment form itself runs inside an iframe on the Binodex origin, so the SDK never handles payment providers, requisites or user data.

- `Root` holds one widget session and renders nothing until every required part is present.
- Parts (`Frame`, `Trigger`, `Close`, `Loader`, `Status`) are placed anywhere inside `Root`, inside your own layout.
- Messages between your page and the widget are checked by window, origin and a per-instance channel.
- Works with every `/embed/pay` build: frames that predate the channel fall back to the legacy handshake.

## Install

The package is on the public npm registry, no token is needed:

```sh
npm install @binopartner/pay-sdk
```

React 18 or newer is an optional peer dependency; `mount()` needs no framework.

Inside this repository the package is an npm workspace (`packages/pay-sdk`) and is linked already:

```sh
npm install
npm run build -w @binopartner/pay-sdk
```

## Your backend: the session endpoint

Your server creates a one-time widget session with the Broker API and returns the response unchanged. The SDK needs nothing else: no client secret and no Broker API token in the browser.

```ts
// POST /api/widget-session  body: { mode: "deposit" | "withdraw" }
const response = await fetch("https://api.binodex.app/v1/broker/widget-sessions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${userAccessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ origin: "https://broker.example", mode, user_ip: clientIp }),
});
return Response.json(await response.json(), { status: response.status });
// { session: "wss_…", expires_in: 60, widget_url?: "https://…/embed/pay?…", widget_origin?: "https://…" }
```

The SDK calls this endpoint with `POST { mode }` (same-origin cookies included) whenever it needs a session: once to open the widget and again when the widget asks for re-authentication. On a non-2xx answer it shows `error.message` from the JSON body.

## React

```tsx
"use client";
import * as PayWidget from "@binopartner/pay-sdk/react";

export function DepositPanel({ onDone }: { onDone: () => void }) {
  return (
    <PayWidget.Root
      mode="deposit"
      sessionEndpoint="/api/widget-session"
      clientId={clientId}
      platformUrl="https://binodex.app"
      onOpenChange={(open) => !open && onDone()}
      onCredited={({ amount, asset }) => refreshBalance()}
    >
      <PayWidget.Loader>Opening the payment form…</PayWidget.Loader>
      <PayWidget.Status />
      <PayWidget.Frame title="Deposit" />
    </PayWidget.Root>
  );
}
```

`clientId` and `platformUrl` are only used when the session response carries no `widget_url`.

### Open on demand

```tsx
<PayWidget.Root mode="withdraw" sessionEndpoint="/api/widget-session" defaultOpen={false}>
  <PayWidget.Trigger>Withdraw</PayWidget.Trigger>
  <div className="sheet">
    <PayWidget.Close>Done</PayWidget.Close>
    <PayWidget.Frame />
  </div>
</PayWidget.Root>
```

A session is created only when the widget opens and is dropped when it closes. Use `open` and `onOpenChange` to control it yourself, and `usePayWidget()` inside `Root` to read `{ open, setOpen, status, error }` for a custom shell.

### `Root` props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `"deposit" \| "withdraw"` | required | Changing it restarts the widget with a new session. |
| `sessionEndpoint` | `string` | | Your endpoint described above. Pass this or `createSession`. |
| `createSession` | `({ mode, signal }) => Promise<WidgetSession>` | | Full control over how the session is fetched. |
| `clientId`, `platformUrl` | `string` | | Fallback URL `${platformUrl}/embed/pay?mode=…&client_id=…`. |
| `lang` | `string` | | For example `ru` or `ru-RU`. |
| `theme` | `"light" \| "dark"` | | Overrides the theme set in the partner cabinet. |
| `open`, `defaultOpen`, `onOpenChange` | | `defaultOpen = true` | Controlled or uncontrolled open state. |
| `onCredited` | `({ amount, asset }) => void` | | A deposit was credited. UI signal only, see Security. |
| `onStatusChange`, `onError` | | | See Status. |
| `requireChannel` | `boolean` | `false` | Refuse frames that do not prove the channel (no legacy fallback). |
| `required` | `PayPart[]` | `[]` | Extra parts that must be present, on top of `frame`. |

## Parts

| Part | Required | Renders | Notes |
| --- | --- | --- | --- |
| `Frame` | yes | while open | Slot for the iframe. Props: `title`, `initialHeight` (720), `minHeight` (520), `maxHeight` (900; pass `Infinity` to lift it). |
| `Trigger` | no | always | `<button>` that opens the widget; sets `aria-expanded` and `aria-controls`. |
| `Close` | no | while open | `<button>` that closes the widget. Labelled "Close" when it has no children. |
| `Loader` | no | while the session or the frame document is loading | `role="status"`. |
| `Status` | no | on error | `role="alert"`. Children may be a function `(error) => ReactNode`. |

Required parts must be rendered unconditionally inside `Root`. If one is missing, `Root` renders nothing at all: no markup, no session request, no iframe. During development it also logs a warning; production builds stay silent. A `Root` that lost a required part stays empty until it is mounted again. On the server `Root` renders nothing; it appears after hydration.

Every part carries `data-binodex-pay="<part>"`; `Frame` and `Loader` also carry `data-status`, `Frame` and `Trigger` carry `data-state="open|closed"`, `Status` carries `data-error="<code>"`.

## Without a framework

`mount()` needs no React, but the package is an ES module meant for a bundler (Vite, webpack, esbuild): a browser cannot resolve the bare `@binopartner/pay-sdk` import by itself. Put the script below into your bundled code, or map the specifier with an import map.

```html
<div id="pay">
  <button data-binodex-pay="trigger">Deposit</button>
  <button data-binodex-pay="close">Close</button>
  <div data-binodex-pay="loader">Opening…</div>
  <div data-binodex-pay="status"></div>
  <div data-binodex-pay="frame"></div>
</div>
<script type="module">
  import { mount } from "@binopartner/pay-sdk";

  const widget = mount(document.getElementById("pay"), {
    mode: "deposit",
    sessionEndpoint: "/api/widget-session",
    open: false,
    onCredited: ({ amount, asset }) => console.log("credited", amount, asset),
  });
  // widget.open(), widget.close(), widget.getState(), widget.destroy()
</script>
```

`mount()` takes the same options as `Root` plus the `Frame` height options. When a required part is missing it returns `null`, sets `hidden` on the root element and warns in development. An empty `status` element is filled with the error message.

## Status and errors

`idle` → `session` (creating the session) → `loading` (frame document loading) → `handshake` (frame loaded, session handed over) → `ready` (form shown). `error` comes with `{ code, message, reason? }`:

| `code` | When |
| --- | --- |
| `session_failed` | The session endpoint failed or returned no valid `session`. `message` is the server's `error.message` when present. |
| `invalid_widget_url` | No usable widget URL: not https (plain http is allowed for `localhost`), embedded credentials, or `widget_url` disagrees with `widget_origin`. |
| `widget_error` | The widget reported an error; `reason` is its code, for example `widget_auth_error`. |

## Protocol

The widget page is `/embed/pay` on the Binodex origin. The SDK adds a random 128-bit channel to the iframe URL fragment (`#channel=…`). Fragments are never sent to servers or in `Referer`.

| Direction | Message | Notes |
| --- | --- | --- |
| widget → page | `binodex-embed:ready` | The widget waits for a session. |
| page → widget | `binodex-embed:init { session }` | Sent only to the widget origin. |
| widget → page | `binodex-embed:resize { height }` | Content height; the SDK clamps it. |
| widget → page | `binodex-embed:credited { amount, asset }` | |
| widget → page | `binodex-embed:close` | The user closed the form inside the widget. |
| widget → page | `binodex-embed:error { message }` | `message` is a code. |
| widget → page | `binodex-embed:reauth-required` | The SDK fetches a fresh session and sends `init` again. |

A widget that understands channels adds `channel` to every message, and expects `channel` in `init`. The SDK picks the dialect from the first `ready`: with the channel it answers with a channel-bound `init` and from then on drops every message without the channel; without it (an older widget) it speaks the legacy handshake, unless `requireChannel` is set. Integrations that never set the fragment see exactly the legacy messages.

## Security

What stays in the iframe: payment providers, card and bank requisites, wallet addresses and user data are rendered inside the iframe on the Binodex origin. The browser's same-origin policy keeps other origins from reading the iframe's content, and the SDK has no API that asks for that data. The only data the widget posts to your page is the list above.

What is checked:

- Your page → widget: `init` is posted with an exact target origin, never `*`, so a widget frame navigated elsewhere never receives the session. The widget accepts `init` only from its parent window, only from an origin registered for your client, only with the exact expected fields and, with a channel, only with its own channel.
- Widget → your page: the SDK accepts a message only when it comes from its own iframe window, from the widget origin, has a known type with valid fields and, once the widget proved the channel, carries that channel. Another iframe, a popup or a second widget instance on the page cannot drive yours.
- Secrets: the SDK only ever hands the widget the one-time `wss_` session (single use, valid for 60 seconds, bound to the user, client and mode). The widget exchanges it for a short-lived token inside the iframe.
- `widget_url` must be https (plain http only on loopback hosts), must not carry credentials and must match `widget_origin`. Take it from the Broker API response only, never from user input.
- The iframe is created with `referrerpolicy="origin"`: the widget learns your origin to verify it, never your page path.

Out of scope, and how to handle it:

- Events are UI hints. A user can fake `onCredited` in their own browser. Never credit, ship or unlock anything because of a widget event; confirm with the Broker API or webhooks.
- Script running on your page (your code, a compromised dependency, an XSS) acts as your page, with everything your page can do, widget sessions included. The SDK cannot protect you from it: keep a strict CSP, add `frame-src` for the Binodex origin, and guard your session route like any authenticated endpoint.
- Clickjacking by the embedding page itself is not something an iframe can prevent.

## Development

```sh
npm run build -w @binopartner/pay-sdk      # ESM + .d.ts into dist/
npm run typecheck -w @binopartner/pay-sdk
npm test -w @binopartner/pay-sdk           # vitest + jsdom
```
