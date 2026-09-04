// In-app notifications: writes events to the notifications table and
// subscribes to new ones in realtime, showing a toast (and a device
// notification while the app is open, if enabled in Settings).
import { supabase } from "./supabaseClient.js?v=13";
import { toast } from "./ui.js?v=13";

export function notificationsEnabled() {
  return localStorage.getItem("notif-enabled") !== "off";
}

export function setNotificationsEnabled(on) {
  localStorage.setItem("notif-enabled", on ? "on" : "off");
}

/** Send a notification. Omit both recipient fields to broadcast to everyone. */
export async function notify({ title, body, recipientId = null, department = null }) {
  try {
    await supabase.from("notifications").insert({
      title,
      body,
      recipient_id: recipientId,
      recipient_department: department,
    });
  } catch (_) {
    // Notifications are best-effort; never block the main action.
  }
}

/** Start listening for notifications addressed to this user. */
export function subscribeNotifications(profile) {
  const channel = supabase
    .channel("notifications-feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => {
        const n = payload.new;
        const forMe =
          (!n.recipient_id && !n.recipient_department) ||
          n.recipient_id === profile.id ||
          n.recipient_department === profile.department ||
          (n.recipient_department === "manager" && profile.role === "manager");
        if (!forMe || !notificationsEnabled()) return;
        toast(`${n.title} — ${n.body}`, "info", 5000);
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(n.title, { body: n.body, icon: "icons/icon-192.png" });
          } catch (_) {}
        }
      }
    )
    .subscribe();
  return channel;
}
