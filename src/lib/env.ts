function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function optional(name: string): string {
  return process.env[name] ?? "";
}

const DEFAULT_API = "https://api.binodex.app/v1";
const DEFAULT_PLATFORM = "https://binodex.app";

export function brokerServerEnv() {
  return {
    clientId: required("BROKER_CLIENT_ID"),
    clientSecret: optional("BROKER_CLIENT_SECRET"),
    apiUrl: (process.env.BROKER_API_URL || DEFAULT_API).replace(/\/$/, ""),
    wsUrl: required("BROKER_WS_URL").replace(/\/$/, ""),
    platformUrl: (process.env.BROKER_PLATFORM_URL || DEFAULT_PLATFORM).replace(
      /\/$/,
      "",
    ),
  };
}
