import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logEvent } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop = "unknown-shop";
  let topic = "unknown-topic";

  try {
    const payload = await authenticate.webhook(request);
    shop = payload.shop;
    topic = payload.topic;
    const { session } = payload;

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }

    await logEvent(shop, "webhook", "success", `${topic} handled`);
  } catch (error) {
    await logEvent(
      shop,
      "webhook",
      "failure",
      `${topic} webhook error: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  return new Response();
};
