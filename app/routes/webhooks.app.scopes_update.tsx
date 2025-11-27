import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logEvent } from "../services/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    let shop = "unknown-shop";
    let topic = "unknown-topic";

    try {
        const { payload, session, topic: webhookTopic, shop: webhookShop } = await authenticate.webhook(request);
        shop = webhookShop;
        topic = webhookTopic;

        const current = payload.current as string[];
        if (session) {
            await db.session.update({
                where: {
                    id: session.id
                },
                data: {
                    scope: current.toString(),
                },
            });
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
