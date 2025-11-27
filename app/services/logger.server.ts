import prisma from "../db.server";

export type EventType = "sync" | "digest" | "webhook" | "error";
export type EventStatus = "success" | "failure" | "pending";

const MAX_MESSAGE_LENGTH = 500;

function normalizeMessage(message?: unknown): string | undefined {
  if (message === undefined || message === null) return undefined;
  if (message instanceof Error) return message.message.slice(0, MAX_MESSAGE_LENGTH);
  const text =
    typeof message === "string"
      ? message
      : typeof message === "object"
        ? JSON.stringify(message)
        : String(message);
  return text.slice(0, MAX_MESSAGE_LENGTH);
}

export async function logEvent(
  shop: string,
  type: EventType,
  status: EventStatus,
  message?: unknown,
) {
  const safeMessage = normalizeMessage(message);
  try {
    await prisma.syncLog.create({
      data: {
        shopDomain: shop,
        scope: type,
        status,
        message: safeMessage,
      },
    });
  } catch {
    // Logging failures should never block main flows.
  }
}
