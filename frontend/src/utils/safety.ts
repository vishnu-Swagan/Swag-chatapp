import { api } from "@/src/api/client";

export type BlockedUser = { id: string; username: string; verified: boolean };

export const safety = {
  block: (target_user_id: string) =>
    api<{ blocked: true; username: string }>("/safety/block", {
      method: "POST",
      body: { target_user_id },
    }),
  unblock: (target_user_id: string) =>
    api<{ unblocked: true }>("/safety/unblock", {
      method: "POST",
      body: { target_user_id },
    }),
  listBlocked: () => api<BlockedUser[]>("/safety/blocked"),
  report: (target_user_id: string, reason: string, category = "abuse") =>
    api<{ reported: true; auto_blocked: true }>("/safety/report", {
      method: "POST",
      body: { target_user_id, reason, category },
    }),
  deleteForEveryone: (message_id: string) =>
    api<{ deleted: true }>("/messages/delete-for-everyone", {
      method: "POST",
      body: { message_id },
    }),
  markImageViewed: (message_id: string) =>
    api<{ viewed: true }>("/messages/image-viewed", {
      method: "POST",
      body: { message_id },
    }),
  getSettings: () =>
    api<{ delete_for_everyone_enabled: boolean }>("/settings"),
  patchSettings: (body: { delete_for_everyone_enabled?: boolean }) =>
    api<{ updated: true } & Record<string, any>>("/settings", {
      method: "PATCH",
      body,
    }),
};
