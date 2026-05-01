import assert from "node:assert/strict";
import prisma from "../config/prisma";
import { ensureAuthBootstrapContext } from "../services/authBootstrap.service";
import { resolveUserWorkspaceIdentity } from "../services/tenant.service";
import { DashboardController } from "../controllers/dashboard.controller";
import { DashboardService } from "../services/dashboard.service";
import { getFlows } from "../controllers/automation.controller";
import { BillingController } from "../controllers/billing.controller";
import { withTimeoutFallback } from "../utils/boundedTimeout";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const createMockResponse = () => {
  const result: {
    statusCode: number;
    payload: any;
    headers: Record<string, string>;
  } = {
    statusCode: 200,
    payload: null,
    headers: {},
  };

  const res: any = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(payload: any) {
      result.payload = payload;
      return payload;
    },
    setHeader(key: string, value: string) {
      result.headers[key] = value;
    },
  };

  return {
    res,
    result,
  };
};

export const authHydrationBootstrapTests: TestCase[] = [
  {
    name: "google signup first login bootstraps workspace and baseline rows",
    run: async () => {
      const originalUserFindUnique = (prisma.user as any).findUnique;
      const originalUserUpdate = (prisma.user as any).update;
      const originalBusinessCreate = (prisma.business as any).create;
      const originalBusinessFindUnique = (prisma.business as any).findUnique;
      const originalTransaction = (prisma as any).$transaction;

      let businessCreateCount = 0;
      let usageCreateCount = 0;
      let addonCreateCount = 0;
      let subscriptionCreateCount = 0;

      try {
        (prisma.user as any).findUnique = async (input: any) => {
          if (input?.select?.ownedBusinesses) {
            return {
              id: "user_1",
              name: "Google Owner",
              businessId: null,
              business: null,
              ownedBusinesses: [],
            };
          }

          return {
            id: "user_1",
            name: "Google Owner",
            email: "owner@example.com",
            avatar: null,
            role: "OWNER",
            tokenVersion: 0,
            businessId: null,
            isActive: true,
            deletedAt: null,
          };
        };

        (prisma.user as any).update = async () => ({
          id: "user_1",
        });

        (prisma.business as any).findUnique = async () => null;
        (prisma.business as any).create = async () => {
          businessCreateCount += 1;
          return {
            id: "business_1",
            name: "Google Owner Workspace",
            website: null,
            industry: null,
            teamSize: null,
            type: null,
            timezone: null,
            ownerId: "user_1",
            deletedAt: null,
          };
        };

        (prisma as any).$transaction = async (callback: any) =>
          callback({
            usage: {
              findUnique: async () => null,
              create: async () => {
                usageCreateCount += 1;
              },
            },
            addonBalance: {
              findUnique: async () => null,
              create: async () => {
                addonCreateCount += 1;
              },
            },
            subscriptionLedger: {
              findFirst: async () => null,
              create: async () => {
                subscriptionCreateCount += 1;
              },
            },
          });

        const result = await ensureAuthBootstrapContext({
          userId: "user_1",
          profileSeed: {
            email: "owner@example.com",
            name: "Google Owner",
            avatar: "https://avatar.example/google-owner.png",
          },
        });

        assert.equal(result.identity.businessId, "business_1");
        assert.equal(result.identity.source, "bootstrapped");
        assert.ok(result.backfilledFields.includes("avatar"));
        assert.equal(businessCreateCount, 1);
        assert.equal(usageCreateCount, 1);
        assert.equal(addonCreateCount, 2);
        assert.equal(subscriptionCreateCount, 1);
      } finally {
        (prisma.user as any).findUnique = originalUserFindUnique;
        (prisma.user as any).update = originalUserUpdate;
        (prisma.business as any).create = originalBusinessCreate;
        (prisma.business as any).findUnique = originalBusinessFindUnique;
        (prisma as any).$transaction = originalTransaction;
      }
    },
  },
  {
    name: "google existing login reuses existing workspace mapping",
    run: async () => {
      const originalUserFindUnique = (prisma.user as any).findUnique;
      const originalUserUpdate = (prisma.user as any).update;
      const originalBusinessCreate = (prisma.business as any).create;
      const originalTransaction = (prisma as any).$transaction;

      let businessCreateCount = 0;

      try {
        (prisma.user as any).findUnique = async (input: any) => {
          if (input?.select?.ownedBusinesses) {
            return {
              id: "user_existing",
              name: "Existing Owner",
              businessId: "business_existing",
              business: {
                id: "business_existing",
                name: "Existing Workspace",
                website: null,
                industry: null,
                teamSize: null,
                type: null,
                timezone: null,
                ownerId: "user_existing",
                deletedAt: null,
              },
              ownedBusinesses: [],
            };
          }

          return {
            id: "user_existing",
            name: "Existing Owner",
            email: "existing@example.com",
            avatar: "https://avatar.example/existing.png",
            role: "OWNER",
            tokenVersion: 2,
            businessId: "business_existing",
            isActive: true,
            deletedAt: null,
          };
        };

        (prisma.user as any).update = async () => ({ id: "user_existing" });
        (prisma.business as any).create = async () => {
          businessCreateCount += 1;
          throw new Error("business should not be created");
        };
        (prisma as any).$transaction = async (callback: any) =>
          callback({
            usage: {
              findUnique: async () => ({ id: "usage_existing" }),
              create: async () => undefined,
            },
            addonBalance: {
              findUnique: async () => ({ id: "addon_existing" }),
              create: async () => undefined,
            },
            subscriptionLedger: {
              findFirst: async () => ({ id: "subscription_existing" }),
              create: async () => undefined,
            },
          });

        const result = await ensureAuthBootstrapContext({
          userId: "user_existing",
          preferredBusinessId: "business_existing",
          profileSeed: {
            email: "existing@example.com",
            name: "Existing Owner",
            avatar: "https://avatar.example/existing.png",
          },
        });

        assert.equal(result.identity.businessId, "business_existing");
        assert.equal(result.identity.source, "linked");
        assert.equal(businessCreateCount, 0);
      } finally {
        (prisma.user as any).findUnique = originalUserFindUnique;
        (prisma.user as any).update = originalUserUpdate;
        (prisma.business as any).create = originalBusinessCreate;
        (prisma as any).$transaction = originalTransaction;
      }
    },
  },
  {
    name: "missing business bootstrap creates workspace mapping",
    run: async () => {
      const originalUserFindUnique = (prisma.user as any).findUnique;
      const originalUserUpdate = (prisma.user as any).update;
      const originalBusinessCreate = (prisma.business as any).create;
      const originalBusinessFindUnique = (prisma.business as any).findUnique;

      let userUpdatedBusinessId: string | null = null;

      try {
        (prisma.user as any).findUnique = async () => ({
          id: "user_2",
          name: "No Workspace Yet",
          businessId: null,
          business: null,
          ownedBusinesses: [],
        });
        (prisma.user as any).update = async (input: any) => {
          userUpdatedBusinessId = input?.data?.businessId || null;
          return {
            id: "user_2",
            businessId: userUpdatedBusinessId,
          };
        };
        (prisma.business as any).findUnique = async () => null;
        (prisma.business as any).create = async () => ({
          id: "business_bootstrap_2",
          name: "No Workspace Yet Workspace",
          website: null,
          industry: null,
          teamSize: null,
          type: null,
          timezone: null,
          ownerId: "user_2",
          deletedAt: null,
        });

        const identity = await resolveUserWorkspaceIdentity({
          userId: "user_2",
        });

        assert.equal(identity.source, "bootstrapped");
        assert.equal(identity.businessId, "business_bootstrap_2");
        assert.equal(userUpdatedBusinessId, "business_bootstrap_2");
      } finally {
        (prisma.user as any).findUnique = originalUserFindUnique;
        (prisma.user as any).update = originalUserUpdate;
        (prisma.business as any).create = originalBusinessCreate;
        (prisma.business as any).findUnique = originalBusinessFindUnique;
      }
    },
  },
  {
    name: "missing profile bootstrap backfills canonical fields",
    run: async () => {
      const originalUserFindUnique = (prisma.user as any).findUnique;
      const originalUserUpdate = (prisma.user as any).update;
      const originalTransaction = (prisma as any).$transaction;

      let profileUpdatePayload: any = null;

      try {
        (prisma.user as any).findUnique = async (input: any) => {
          if (input?.select?.ownedBusinesses) {
            return {
              id: "user_profile_1",
              name: "Legacy",
              businessId: "business_profile_1",
              business: {
                id: "business_profile_1",
                name: "Profile Workspace",
                website: null,
                industry: null,
                teamSize: null,
                type: null,
                timezone: null,
                ownerId: "user_profile_1",
                deletedAt: null,
              },
              ownedBusinesses: [],
            };
          }

          return {
            id: "user_profile_1",
            name: "Legacy",
            email: "legacy@example.com",
            avatar: null,
            role: "OWNER",
            tokenVersion: 1,
            businessId: "business_profile_1",
            isActive: true,
            deletedAt: null,
          };
        };

        (prisma.user as any).update = async (input: any) => {
          profileUpdatePayload = input?.data || null;
          return { id: "user_profile_1" };
        };
        (prisma as any).$transaction = async (callback: any) =>
          callback({
            usage: {
              findUnique: async () => ({ id: "usage_existing" }),
              create: async () => undefined,
            },
            addonBalance: {
              findUnique: async () => ({ id: "addon_existing" }),
              create: async () => undefined,
            },
            subscriptionLedger: {
              findFirst: async () => ({ id: "sub_existing" }),
              create: async () => undefined,
            },
          });

        const result = await ensureAuthBootstrapContext({
          userId: "user_profile_1",
          profileSeed: {
            name: "Updated Name",
            email: "updated@example.com",
            avatar: "https://avatar.example/new.png",
          },
        });

        assert.equal(result.backfilledFields.includes("name"), true);
        assert.equal(result.backfilledFields.includes("email"), true);
        assert.equal(result.backfilledFields.includes("avatar"), true);
        assert.equal(profileUpdatePayload?.name, "Updated Name");
        assert.equal(profileUpdatePayload?.email, "updated@example.com");
        assert.equal(profileUpdatePayload?.avatar, "https://avatar.example/new.png");
      } finally {
        (prisma.user as any).findUnique = originalUserFindUnique;
        (prisma.user as any).update = originalUserUpdate;
        (prisma as any).$transaction = originalTransaction;
      }
    },
  },
  {
    name: "dashboard projection cold boot returns fallback payload",
    run: async () => {
      const originalGetStats = DashboardService.getStats;
      const mockReq: any = {
        user: {
          id: "user_dash_1",
          role: "OWNER",
          businessId: "business_dash_1",
        },
        originalUrl: "/api/dashboard/stats",
      };
      const { res, result } = createMockResponse();

      try {
        (DashboardService as any).getStats = async () => {
          throw new Error("projection_cold_boot");
        };

        await DashboardController.getStats(mockReq, res);

        assert.equal(result.statusCode, 200);
        assert.equal(result.payload?.success, true);
        assert.equal(result.payload?.data?.totalLeads, 0);
        assert.equal(result.payload?.data?.premiumLocked, true);
      } finally {
        (DashboardService as any).getStats = originalGetStats;
      }
    },
  },
  {
    name: "automation projection cold boot returns safe empty list",
    run: async () => {
      const originalFindMany = (prisma.automationFlow as any).findMany;
      const mockReq: any = {
        user: {
          id: "user_auto_1",
          role: "OWNER",
          businessId: "business_auto_1",
        },
      };
      const { res, result } = createMockResponse();

      try {
        (prisma.automationFlow as any).findMany = async () => {
          throw new Error("automation_projection_cold_boot");
        };

        await getFlows(mockReq, res);

        assert.equal(result.statusCode, 200);
        assert.equal(result.payload?.success, true);
        assert.deepEqual(result.payload?.data, []);
      } finally {
        (prisma.automationFlow as any).findMany = originalFindMany;
      }
    },
  },
  {
    name: "billing projection cold boot returns canonical empty payload",
    run: async () => {
      const request: any = {
        headers: {},
      };

      const payload = await (BillingController as any).buildBillingResponse(
        null,
        request
      );

      assert.equal(payload.success, true);
      assert.equal(payload.billing?.planKey, "FREE_LOCKED");
      assert.equal(payload.billing?.status, "INACTIVE");
      assert.deepEqual(payload.invoices, []);
    },
  },
  {
    name: "slow query timeout fallback resolves deterministic projection",
    run: async () => {
      const projection = await withTimeoutFallback({
        label: "slow_query_timeout_fallback",
        timeoutMs: 20,
        task: new Promise<never>(() => undefined),
        fallback: {
          ok: true,
          source: "fallback_projection",
        },
      });

      assert.equal(projection.timedOut, true);
      assert.equal(projection.failed, false);
      assert.deepEqual(projection.value, {
        ok: true,
        source: "fallback_projection",
      });
    },
  },
];
