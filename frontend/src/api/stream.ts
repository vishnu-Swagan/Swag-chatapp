import { api } from "@/src/api/client";

export type StreamCredentials = {
  token: string;
  api_key: string;
  user_id: string;
};

// Authenticated: the backend mints a short-lived Stream user token for the
// current caller (identified by their existing JWT) and returns the public
// API key needed to initialize the Stream client.
export function fetchStreamCredentials(): Promise<StreamCredentials> {
  return api<StreamCredentials>("/stream/token", { method: "POST" });
}
