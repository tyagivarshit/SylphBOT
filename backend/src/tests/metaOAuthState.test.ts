import assert from "node:assert/strict";
import {
  createMetaOAuthState,
  META_OAUTH_STATE_TTL_MS,
  verifyMetaOAuthState,
} from "../utils/metaOAuthState";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const metaOAuthStateTests: TestCase[] = [
  {
    name: "meta oauth state preserves signed payload",
    run: () => {
      const state = createMetaOAuthState({
        userId: "user_1",
        businessId: "business_1",
        workspaceId: "workspace_1",
        platform: "INSTAGRAM",
        mode: "reconnect",
        preferredFacebookPageId: "fb_page_1",
        preferredInstagramProfessionalAccountId: "ig_prof_1",
      });

      const payload = verifyMetaOAuthState(state);

      assert.ok(payload);
      assert.equal(payload!.userId, "user_1");
      assert.equal(payload!.businessId, "business_1");
      assert.equal(payload!.workspaceId, "workspace_1");
      assert.equal(payload!.platform, "INSTAGRAM");
      assert.equal(payload!.mode, "reconnect");
      assert.equal(payload!.preferredFacebookPageId, "fb_page_1");
      assert.equal(
        payload!.preferredInstagramProfessionalAccountId,
        "ig_prof_1"
      );
    },
  },
  {
    name: "meta oauth state rejects tampered payload",
    run: () => {
      const state = createMetaOAuthState({
        userId: "user_1",
        businessId: "business_1",
        platform: "WHATSAPP",
        mode: "connect",
      });

      const [encoded, signature] = state.split(".");
      const tampered = `${encoded.slice(0, -1)}x.${signature}`;

      assert.equal(verifyMetaOAuthState(tampered), null);
    },
  },
  {
    name: "meta oauth state expires after ttl",
    run: () => {
      const originalNow = Date.now;

      try {
        const seedNow = 1_750_000_000_000;
        Date.now = () => seedNow;

        const state = createMetaOAuthState({
          userId: "user_1",
          businessId: "business_1",
          platform: "INSTAGRAM",
          mode: "connect",
        });

        Date.now = () => seedNow + META_OAUTH_STATE_TTL_MS + 1;

        assert.equal(verifyMetaOAuthState(state), null);
      } finally {
        Date.now = originalNow;
      }
    },
  },
];
