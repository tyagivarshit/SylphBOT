import type { Request, Response } from "express";
import {
  getHelpAiReply,
  HELP_AI_FALLBACK_REPLY,
} from "../services/helpAi.service";

export class HelpAiController {
  static async reply(req: Request, res: Response) {
    try {
      const message = String(req.body?.message || "").trim();

      if (!message) {
        return res.json({
          reply: HELP_AI_FALLBACK_REPLY,
        });
      }

      return res.json({
        reply: getHelpAiReply(message),
      });
    } catch (error) {
      req.logger?.error({ err: error }, "Help AI request failed");

      return res.json({
        reply: HELP_AI_FALLBACK_REPLY,
      });
    }
  }
}
