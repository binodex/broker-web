# @binopartner/pay-sdk

Embed Binodex deposits and withdrawals in a broker site. The package has two integrations that share one session endpoint:

- **Iframe widget** (`@binopartner/pay-sdk`, `@binopartner/pay-sdk/react`): the payment form runs inside an iframe on the Binodex origin. The sections from "React" to "Protocol" below describe it. It is unchanged in 0.2.
- **Elements** (`@binopartner/pay-sdk/elements`, `@binopartner/pay-sdk/core`, `@binopartner/pay-sdk/elements.css`): the form is rendered by your page with React components and hooks over a headless core that calls the Binodex pay API directly. See [Elements](#elements).

The rest of this introduction is about the iframe widget. The SDK gives you a root component and composable parts for React, and a `mount()` function for any other stack. The payment form itself runs inside an iframe on the Binodex origin, so the SDK never handles payment providers, requisites or user data.

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

`user_ip` must be the IP address of the end user's browser (from your edge or load balancer, for example the first entry of `X-Forwarded-For` that your own proxy appended), never the IP of your server. Binodex uses it to pick the regional host that is reachable for that user; with your server's IP every user is routed as if they were in your data center.

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
// { session: "wss_…", expires_in: 60, widget_url?: "https://…/embed/pay?…", widget_origin?: "https://…",
//   region?: "ru" | "global", geo?: "ru" | "global" | "unknown", api_base?: "https://api.…/v1", api_bases?: [...],
//   widget_origins?: [...], pay_api?: true }
```

Relay the body as is: Elements read `api_bases`, `widget_origins`, `geo`, `region` and `pay_api` from it. The iframe widget reads `widget_origins` too: if the widget does not answer within 8 seconds, it reopens the same form on the next Binodex domain from that list (for example the one reachable from Russia), keeping the same session and channel. It never switches once the widget has answered, tries only https origins allowed by `allowedWidgetOrigins`, and keeps waiting on the last domain instead of failing. A session without `widget_origins` behaves as before.

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
| `allowedWidgetOrigins` | `string[]` | | Origins the widget may be served from, for example `["https://binodex.app"]`. A widget URL on any other origin is refused with `invalid_widget_url` and no iframe is created. An empty list refuses every widget. Not set: any https origin the session names is accepted. |
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
- `widget_url` must be https (plain http only on loopback hosts), must not carry credentials and must match `widget_origin`. Take it from the Broker API response only, never from user input. Set `allowedWidgetOrigins` to pin the widget to the Binodex origins you expect: if your session route ever returns a foreign `widget_url`, the SDK refuses it and never hands the session to that origin. The session response can name a regional widget host, so list every Binodex widget origin you expect.
- The iframe permissions (`payment`, `clipboard-write`) are granted to the widget origin only, not to every origin.
- The iframe is created with `referrerpolicy="origin"`: the widget learns your origin to verify it, never your page path.

Out of scope, and how to handle it:

- Events are UI hints. A user can fake `onCredited` in their own browser. Never credit, ship or unlock anything because of a widget event; confirm with the Broker API or webhooks.
- Script running on your page (your code, a compromised dependency, an XSS) acts as your page, with everything your page can do, widget sessions included. The SDK cannot protect you from it: keep a strict CSP, add `frame-src` for the Binodex origin, and guard your session route like any authenticated endpoint.
- Clickjacking by the embedding page itself is not something an iframe can prevent.

## Elements

Elements render the payment form in your own DOM with your own styles. They talk to the Binodex pay API (`/v1/broker/pay/*`) directly from the browser with a short-lived token that the SDK obtains from your session endpoint. Requires React 18 or newer.

```tsx
"use client";
import * as Pay from "@binopartner/pay-sdk/elements";
import "@binopartner/pay-sdk/elements.css";

export function DepositPanel({ onClose }: { onClose: () => void }) {
  return (
    <Pay.Root
      mode="deposit"
      sessionEndpoint="/api/widget-session"
      locale="ru"
      fallback="iframe"
      onOpenChange={(open) => !open && onClose()}
      onEvent={(event) => {
        if (event.type === "deposit.credited") refreshBalanceFromYourServer();
      }}
    >
      <Pay.DepositForm />
    </Pay.Root>
  );
}
```

`Pay.WithdrawForm` is the withdrawal preset. A deposit token cannot withdraw and a withdrawal token cannot deposit: a page with both tabs renders two `Pay.Root` elements, one per mode.

### `Pay.Root` props

| Prop | Default | Notes |
| --- | --- | --- |
| `mode` | required | `"deposit"` or `"withdraw"`. |
| `sessionEndpoint` / `createSession` | | Same contract as the iframe widget. |
| `clientId` | from `widget_url` | Your Broker API client id, needed to redeem the session. Taken from the session's `widget_url` when not set. |
| `allowedApiOrigins` | | Pin the pay API hosts, for example `["https://api.binodex.app", "https://api.binodex.pro"]`. A session naming any other host is refused with `INVALID_API_BASE`. |
| `allowedWidgetOrigins` | | Pin the origins the requisites frame (and the iframe fallback) may load from. |
| `locale` | browser language | `de`, `en`, `es`, `fr`, `hi`, `it`, `ru`, `tr`, `ua` (also `uk`), `ar` (RTL), `cs`. An unknown value falls back to the browser language, then English. |
| `messages` | | Override any message by key, for example `{ "submit.deposit": "Top up" }`. |
| `appearance` | | `{ theme: "light" \| "dark" \| "auto", skin: "classic" \| "black", variables: { "color-accent": "#00c853", "radius-md": "4px" } }`. `dark` is the Classic navy palette of binodex; `skin: "black"` switches it to the black skin. |
| `assetBaseUrl` | the reachable Binodex domain | Where bank logos, coin and network icons and country flags are loaded from (`<assetBaseUrl>/img/...`). Not set: the Binodex domain from `widget_origins` whose pay API answered, so a user in Russia gets them from the Russia-reachable domain. Point it at your own copy to keep every request on your origin. |
| `fontBaseUrl` | the reachable Binodex domain | Where Gilroy is loaded from (`<fontBaseUrl>/Gilroy-*.woff2`). Not set: the reachable Binodex domain first, the other domains of the session as fallbacks. `false` loads no font. |
| `open`, `defaultOpen`, `onOpenChange` | `defaultOpen = true` | A token is requested only while open; closing drops it. |
| `onEvent` | | Receives every `PayEvent`, see below. |
| `fallback` | `"error"` | `"iframe"` renders the iframe widget instead when the pay API is switched off (`pay_api: false`, `PAY_API_DISABLED`) or the backend is older and sends no `api_base`. Pass `platformUrl` for the iframe's fallback URL as before. |
| `returnUrl` | | Where a hosted payment page sends the user back. Must be an origin registered for your client. |
| `unstyled` | `false` | Drops every `bp-*` class; data attributes stay. |
| `apiBase` | | Local development only: overrides the host from the session. |

### Components

Every component accepts `className`, `style` and `unstyled`, forwards its ref and carries `data-binodex-pay="<part>"` plus state attributes (`data-step`, `data-status`, `data-selected`, `data-pending`, `data-invalid`, `data-error`), so Tailwind or shadcn can target it: `[&_[data-binodex-pay=submit][data-pending]]:opacity-50`.

| Component | Renders |
| --- | --- |
| `Trigger`, `Close` | Open and close buttons, same semantics as the iframe parts. |
| `Loader` | While the session or the first data loads. `role="status"`. |
| `ErrorMessage` | Session and flow errors from the error code (never the server text), with a retry button for transient errors. Children may be `(error) => node`. |
| `Balance` | `variant="available" \| "withdrawable"`. |
| `MethodPicker`, `CurrencyPicker`, `NetworkPicker` | Crypto routes, fiat rails and the card onramp. `filter` and `renderItem` props. |
| `AmountInput`, `PhoneInput`, `AddressInput`, `TwoFactorInput` | Inputs with limits, validation hints and `one-time-code` autocomplete for 2FA. `PhoneInput` is optional and renders only with `always` (the phone is never required by the API). |
| `Quote` | Fees, amount received, ETA, slippage. |
| `CryptoAddress` | Address, copy button, QR code (rendered locally, no image host), network warning, high-fee warning. |
| `Requisites` | Fiat payment details: raw rows with copy buttons, or the requisites frame (see Security). `data-delivery="raw" \| "frame"`. |
| `RequisitesFrame`, `ReceiptUpload`, `Countdown`, `RedirectButton`, `Onramp` | Frame, receipt upload (RU deposits in raw mode; in frame mode the receipt is uploaded inside the frame), server-clock countdown, hosted page link, onramp (`display="embed" \| "tab"`). |
| `SlippageWarning`, `SubmitButton`, `Status`, `BackButton`, `Qr` | |
| `RestartButton`, `MethodNotice` | Cancel / new payment for card deposits (and a new withdrawal after a final status); the receipt notice under the amount for rails that may need a receipt. |
| `DepositForm`, `WithdrawForm` | Full screens composed from the parts above, laid out like the binodex payment modal: a card with the title, the balance and a close button, the Crypto / Card tabs, the payment country and the bank tiles. Replace any piece: `<Pay.DepositForm components={{ MethodPicker: MyPicker }} />`. |

### Hooks

`usePay()`, `usePayContext()`, `useBalance()`, `usePaymentMethods()`, `useDepositQuote(methodId, amount)`, `useCryptoDeposit({ chainId, currency })`, `useCreateDeposit()`, `useDeposit(id)`, `useAttachReceipt(id)`, `useOnramp()`, `useWithdrawQuote({ methodId, address, amount })`, `useCreateWithdrawal()`, `useWithdrawal(id)`, `useDepositFlow()`, `useWithdrawFlow()`, `useCountdown(expiresAt)`, `usePayEvents(handler)`, `usePayMessages()`. All of them read external stores through `useSyncExternalStore`; no data-fetching library is needed. Money is created only from event handlers (`submit`, `create`, `request`), never from effects, so React StrictMode cannot create a second deposit.

### Theming

`elements.css` (it already contains `ui.css`) puts every rule into `@layer binopartner-pay` with class or zero-specificity selectors under `.bp-root`, so any rule of yours wins. The default look is the binodex payment modal in three palettes: light, Classic navy (`theme: "dark"`) and black (`skin: "black"`). Tokens are CSS variables on the root element: `--bp-font-family`, `--bp-font-size-xs|sm|md|lg`, `--bp-color-bg`, `--bp-color-surface`, `--bp-color-surface-2`, `--bp-color-surface-raised`, `--bp-color-surface-hover`, `--bp-color-text`, `--bp-color-text-muted`, `--bp-color-border`, `--bp-color-border-strong`, `--bp-color-accent`, `--bp-color-accent-text`, `--bp-color-on-accent`, `--bp-color-overlay`, `--bp-color-skeleton`, `--bp-color-veil`, `--bp-color-success|warning|danger|focus`, `--bp-radius-sm|md|lg|pill`, `--bp-space-1..6`, `--bp-control-height`, `--bp-shadow`, `--bp-transition` (`TOKEN_NAMES` in `/core`), plus `--bp-focus-width`, `--bp-focus-offset` for the keyboard focus ring and `--bp-brand-filter` for the logo in the header. Defaults come from your partner cabinet branding, then `appearance.variables`, then your CSS. Nothing is written outside the root element.

**Font.** The form uses Gilroy, like binodex, with a system fallback. `Root` registers the four weights through the `FontFace` API once the session names its domains: from the Binodex domain whose pay API answered, with the other domains as fallbacks. No `<style>` element is written, so a strict `style-src` needs nothing; `font-src` must allow both domains. A weight is downloaded only when text uses it, so a `--bp-font-family` of your own downloads nothing. To self-host, copy the files and pass `fontBaseUrl="https://your.cdn/fonts"`; `fontBaseUrl={false}` turns it off. Outside `Root` (the `/ui` views, a headless UI) call `registerFontFaces(client.widgetOrigins().map((origin) => origin + "/fonts"))` from `@binopartner/pay-sdk/ui`, or inject `fontFaceCss(url)`. `@binopartner/pay-sdk/fonts.css` stays for pages without a client, and loads from `https://binodex.app/fonts/` only, which is not reachable from Russia. Using Gilroy on your own domain may need its own font licence: check before self-hosting.

**Remote images.** Bank logos, coin and network icons and country flags are images under `assetBaseUrl` (they fall back to a coloured initial when an image does not load). Not set, that is the reachable Binodex domain of the session. Allow both Binodex domains in `img-src` or self-host the images.

### UI views

`@binopartner/pay-sdk/ui` (with `@binopartner/pay-sdk/ui.css`) exports the views the elements are built from, without any client, flow or network code: `PayCard`, `PayHeader`, `PayBody`, `EntryTabs`, `EntryOptions`, `MethodGrid`, `RoutePicker`, `RouteColumn`, `CountrySelect`, `AmountField`, `TextField`, `TwoFactorField`, `Summary`, `QuoteRows`, `DetailsAccordion`, `CryptoAddressCard`, `CreditBanner`, `Requisites`, `StatusPanel`, `ReceiptForm`, `PdfReceiptWarning`, `ReceiptAttached`, `SlippageWarning`, `WithdrawResult`, `StatusSteps`, `SubmitButton`, `LinkButton`, `RetryButton`, `ErrorBox`, `Notice`, `Hint`, `Skeleton`, `Loader`, `PollNotice`, `GeoBlock`, the layout pieces `CardTab`, `RailForm`, `ReceiptBlock`, `BrandLogo` and the icons. `ReceiptForm` keeps the picked file itself, or hands it to you with `file` + `onFileChange` (then you validate it) and shows a preview button with `onPreview`. Props in, callbacks out; they render on the server. Wrap them in `<PayUiRoot theme skin t={createTranslator("ru")}>` (or `PayUiProvider` inside your own `.bp-root`); without `t` the views speak English.

### Events

`session.ready`, `session.expired`, `method.selected`, `deposit.created`, `deposit.status`, `deposit.credited`, `withdrawal.created`, `withdrawal.status`, `close.requested`, `error`. Each carries `{ type, at, source: "client" }` and the server ids (`depositId`, `withdrawalId`, `paymentId`) to verify on your server. `deposit.credited` comes from the Binodex activity feed while a deposit form is open; its `paymentId` is the same id as in `GET /v1/broker/user/payments` and in postbacks.

### Headless core

`@binopartner/pay-sdk/core` has no dependencies and no React: `createPayClient(options)` (session, token, host selection, typed calls, error codes), `createDepositFlow(client)` and `createWithdrawFlow(client)` (state machines with `subscribe`/`getSnapshot`, debounced quotes, polling, idempotency keys), plus the formatting and validation rules the elements use. Use it to build a UI in any framework.

Amounts are written the way binodex writes them in every language: dollars as `$1250.00`, fiat grouped by its own currency with the symbol after a space (`formatMoney`: `5 007 ₽`, `1,00,000 ₹`), the amount to transfer on a paying screen with kopecks and hryvnia cents (`formatPayingAmount`: `22 227,00 ₽`), limits as `0.05 SOL` or `$10.00` (`formatMinLimit`).

## Security (elements)

- **Grant nothing on events.** Events are UI hints; any script on your page can fake them, and so can the user. Credit, ship or unlock only after your server confirmed the payment with `GET /v1/broker/user/payments` or a postback (postbacks are unsigned: verify them against the Broker API).
- **Token.** The widget token (15 minutes, one user, one mode, bound to your origin) lives only in memory inside the client closure. It is never written to `localStorage`, `sessionStorage`, cookies or URLs, never passed to events and has no public getter. It is renewed through your session endpoint 60 seconds before expiry or after the first `401`, once for all concurrent requests. A script that runs on your page can still intercept `fetch`; protect your page, see CSP below. If you suspect a leak, contact Binodex: every widget token of your client can be revoked at once.
- **Hosts.** The session response names the pay API hosts. The SDK accepts only `https://<host>/v1` (plain http only on localhost) without credentials, query or fragment, and only hosts in `allowedApiOrigins` when you set it. It probes the preferred host (`GET /v1/broker/pay/ping`, 2.5 s), falls back to the next one, races them when the user's region is unknown, and switches hosts once after a network error. The region hint is `geo` (with `region` as the fallback for older backends); when it is `unknown` both hosts are probed at once. Idempotency keys make that retry safe.
- **Requisites.** Card numbers, phones and recipient names of fiat payments are third-party data. By default they are shown in a small frame on the Binodex origin (the same host the SDK proved reachable), so session replay tools and other scripts on your page do not read them. Brokers enabled for raw delivery get them as JSON; the SDK then marks those nodes with `data-hj-suppress`, `data-sentry-mask`, `data-private` and `ym-hide-content`. These attributes are best effort for the tools that honour them, not protection.
- **What is never sent to the browser:** provider names, provider order ids, rates, commissions beyond the displayed one, risk flags.
- **Idempotency.** Every create carries an `Idempotency-Key` bound to the exact request body (amount, address, quote, 2FA code and so on). The key is reused only to retry the identical body after a network error, a 5xx or `IDEMPOTENCY_IN_PROGRESS`; any other answer, or any change of the body, starts a new key. On `IDEMPOTENCY_CONFLICT` the withdrawal form reloads the context and shows the withdrawal already in flight.

### CSP

The pay API and the requisites frame are served by two regional host pairs (global and Russia-reachable). Allow both pairs:

```
connect-src 'self' https://api.binodex.app https://api.binodex.pro;
frame-src https://binodex.app https://binodex.pro https://*.onramper.com;
font-src https://binodex.app https://binodex.pro;
img-src 'self' data: https:;
```

Replace the hosts with the ones in your session responses (`api_bases`, `widget_origins`) and in `allowedApiOrigins` / `allowedWidgetOrigins`. `img-src` covers the bank logos, coin icons and flags from the Binodex domains, your logo from the partner cabinet and providers that send a QR image instead of a QR payload; crypto QR codes are drawn locally as SVG. With `assetBaseUrl` / `fontBaseUrl` on your own host, list that host instead.

## Migration from the iframe widget

| Iframe (`/react`, `mount`) | Elements (`/elements`) |
| --- | --- |
| `PayWidget.Root` + `PayWidget.Frame` | `Pay.Root` + `Pay.DepositForm` / `Pay.WithdrawForm`, or your own composition of parts |
| `Trigger`, `Close`, `Loader` | same names, same semantics |
| `Status` (errors) | `Pay.ErrorMessage`; `Pay.Status` now shows the payment status |
| `usePayWidget()` | `usePay()` (superset) |
| `onCredited` | `onEvent` with `deposit.credited`, which now actually fires |
| `onStatusChange`, `onError` | `onEvent` (`session.*`, `error`) |
| `allowedWidgetOrigins`, `requireChannel` | kept for the fallback; add `allowedApiOrigins` |

Your session endpoint stays the same; relay the Broker API response unchanged and send the end user's IP as `user_ip`. Start with `fallback="iframe"`: if the pay API is switched off or your backend region does not serve it yet, users get the iframe widget as before. If you wired side effects to `onCredited`, note that it never fired in production while `deposit.credited` does: keep crediting from your server only.

## Development

```sh
npm run build -w @binopartner/pay-sdk      # ESM + .d.ts into dist/
npm run typecheck -w @binopartner/pay-sdk
npm test -w @binopartner/pay-sdk           # vitest + jsdom
```
