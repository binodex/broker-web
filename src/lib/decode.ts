export function decodeBrokerPayload(payload: unknown): unknown {
  if (payload == null) return null;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }
  if (payload instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(payload));
  }
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "data" in payload &&
    Array.isArray((payload as { data: unknown }).data)
  ) {
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from((payload as { data: number[] }).data),
      ),
    );
  }
  return payload;
}
