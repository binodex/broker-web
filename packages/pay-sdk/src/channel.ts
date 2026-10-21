const CHANNEL_BYTES = 16;

export const createChannel = (): string => {
  const bytes = new Uint8Array(CHANNEL_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};
