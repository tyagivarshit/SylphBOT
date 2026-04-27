import assert from "node:assert/strict";
import axios from "axios";
import prisma from "../config/prisma";
import { encrypt } from "../utils/encrypt";
import { deliverLeadMessage } from "../services/sendMessage.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const consentRevokeMidflightTests: TestCase[] = [
  {
    name: "consent revoke mid-flight blocks outbound before provider call",
    run: async () => {
      const originalAxiosPost = axios.post;
      const originalConsentFindMany = (prisma.consentLedger as any).findMany;
      let networkCalls = 0;

      try {
        axios.post = (async () => {
          networkCalls += 1;
          return {
            data: {
              messages: [{ id: "should_not_send" }],
            },
          };
        }) as any;
        (prisma.consentLedger as any).findMany = async () => [
          {
            id: "consent_1",
            source: "TEST",
            legalBasis: null,
            grantedAt: null,
            revokedAt: new Date("2026-04-27T12:00:00.000Z"),
            createdAt: new Date("2026-04-27T12:00:00.000Z"),
          },
        ];

        const result = await deliverLeadMessage({
          lead: {
            id: "lead_1",
            businessId: "business_1",
            platform: "WHATSAPP",
            phone: "+15555550123",
            client: {
              accessToken: encrypt("token_1"),
              phoneNumberId: "phone_number_1",
              platform: "WHATSAPP",
            },
          },
          message: "hello",
        });

        assert.equal(result.delivered, false);
        assert.equal(result.reason, "CONSENT_REVOKED");
        assert.equal(networkCalls, 0);
      } finally {
        axios.post = originalAxiosPost;
        (prisma.consentLedger as any).findMany = originalConsentFindMany;
      }
    },
  },
];
