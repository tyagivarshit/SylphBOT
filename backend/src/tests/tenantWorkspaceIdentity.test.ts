import assert from "node:assert/strict";
import prisma from "../config/prisma";
import { resolveUserWorkspaceIdentity } from "../services/tenant.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const tenantWorkspaceIdentityTests: TestCase[] = [
  {
    name: "workspace resolver falls back to owner workspace and persists businessId",
    run: async () => {
      const originalUserFindUnique = (prisma.user as any).findUnique;
      const originalUserUpdate = (prisma.user as any).update;
      const originalBusinessFindUnique = (prisma.business as any).findUnique;

      let updatePayload: any = null;

      try {
        (prisma.user as any).findUnique = async () => ({
          id: "user_1",
          businessId: null,
          business: null,
          ownedBusinesses: [
            {
              id: "business_owner",
              name: "Owner Workspace",
              website: null,
              industry: null,
              teamSize: null,
              type: null,
              timezone: null,
              ownerId: "user_1",
              deletedAt: null,
            },
          ],
        });
        (prisma.user as any).update = async (input: any) => {
          updatePayload = input;
          return {
            id: "user_1",
            businessId: input?.data?.businessId || null,
          };
        };
        (prisma.business as any).findUnique = async () => null;

        const identity = await resolveUserWorkspaceIdentity({
          userId: "user_1",
        });

        assert.equal(identity.source, "owner_fallback");
        assert.equal(identity.businessId, "business_owner");
        assert.equal(updatePayload?.data?.businessId, "business_owner");
      } finally {
        (prisma.user as any).findUnique = originalUserFindUnique;
        (prisma.user as any).update = originalUserUpdate;
        (prisma.business as any).findUnique = originalBusinessFindUnique;
      }
    },
  },
  {
    name: "workspace resolver accepts preferred workspace owned by user",
    run: async () => {
      const originalUserFindUnique = (prisma.user as any).findUnique;
      const originalUserUpdate = (prisma.user as any).update;
      const originalBusinessFindUnique = (prisma.business as any).findUnique;

      try {
        (prisma.user as any).findUnique = async () => ({
          id: "user_1",
          businessId: null,
          business: null,
          ownedBusinesses: [],
        });
        (prisma.user as any).update = async () => ({
          id: "user_1",
          businessId: "business_preferred",
        });
        (prisma.business as any).findUnique = async () => ({
          id: "business_preferred",
          name: "Preferred Workspace",
          website: null,
          industry: null,
          teamSize: null,
          type: null,
          timezone: null,
          ownerId: "user_1",
          deletedAt: null,
        });

        const identity = await resolveUserWorkspaceIdentity({
          userId: "user_1",
          preferredBusinessId: "business_preferred",
        });

        assert.equal(identity.source, "preferred");
        assert.equal(identity.businessId, "business_preferred");
      } finally {
        (prisma.user as any).findUnique = originalUserFindUnique;
        (prisma.user as any).update = originalUserUpdate;
        (prisma.business as any).findUnique = originalBusinessFindUnique;
      }
    },
  },
  {
    name: "workspace resolver keeps linked workspace without mutating user",
    run: async () => {
      const originalUserFindUnique = (prisma.user as any).findUnique;
      const originalUserUpdate = (prisma.user as any).update;

      let updateCalled = false;

      try {
        (prisma.user as any).findUnique = async () => ({
          id: "user_1",
          businessId: "business_linked",
          business: {
            id: "business_linked",
            name: "Linked Workspace",
            website: null,
            industry: null,
            teamSize: null,
            type: null,
            timezone: null,
            ownerId: "user_1",
            deletedAt: null,
          },
          ownedBusinesses: [],
        });
        (prisma.user as any).update = async () => {
          updateCalled = true;
          return {
            id: "user_1",
            businessId: "business_linked",
          };
        };

        const identity = await resolveUserWorkspaceIdentity({
          userId: "user_1",
        });

        assert.equal(identity.source, "linked");
        assert.equal(identity.businessId, "business_linked");
        assert.equal(updateCalled, false);
      } finally {
        (prisma.user as any).findUnique = originalUserFindUnique;
        (prisma.user as any).update = originalUserUpdate;
      }
    },
  },
];
