import assert from "node:assert/strict";
import {
  createAvailabilityEngineService,
  type AvailabilityEngineRepository,
} from "../services/availabilityEngine.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const availabilityEngineTests: TestCase[] = [
  {
    name: "availability engine updates load state deterministically under reservations",
    run: async () => {
      const store = new Map<string, any>();
      const repository: AvailabilityEngineRepository = {
        upsert: async (input) => {
          const key = `${input.businessId}:${input.humanId}`;
          const current = store.get(key) || {
            id: key,
            businessId: input.businessId,
            humanId: input.humanId,
            state: "OFFLINE",
            activeLoad: 0,
            maxLoad: 2,
            timezone: null,
            language: null,
            skillScore: 0,
            responseScore: 0,
            lastSeenAt: null,
            metadata: null,
            updatedAt: new Date(),
          };
          const next = {
            ...current,
            activeLoad: input.activeLoad ?? current.activeLoad,
            maxLoad: input.maxLoad ?? current.maxLoad,
            timezone:
              input.timezone === undefined ? current.timezone : input.timezone,
            language:
              input.language === undefined ? current.language : input.language,
            skillScore:
              input.skillScore === undefined ? current.skillScore : input.skillScore,
            responseScore:
              input.responseScore === undefined
                ? current.responseScore
                : input.responseScore,
            metadata: input.metadata ?? current.metadata,
            lastSeenAt: input.lastSeenAt ?? current.lastSeenAt,
            updatedAt: new Date(),
          };
          next.state =
            input.state === "OFFLINE" || input.state === "AWAY"
              ? input.state
              : next.activeLoad >= next.maxLoad
              ? "OVERLOADED"
              : next.activeLoad >= Math.ceil(next.maxLoad * 0.75)
              ? "BUSY"
              : "AVAILABLE";
          store.set(key, next);
          return next;
        },
        find: async ({ businessId, humanId }) =>
          store.get(`${businessId}:${humanId}`) || null,
        listByBusiness: async (businessId) =>
          Array.from(store.values()).filter((row) => row.businessId === businessId),
      };
      const service = createAvailabilityEngineService({
        repository,
      });

      await service.heartbeat({
        businessId: "business_1",
        humanId: "human_1",
        maxLoad: 2,
      });
      const first = await service.reserveSlot({
        businessId: "business_1",
        humanId: "human_1",
      });
      const second = await service.reserveSlot({
        businessId: "business_1",
        humanId: "human_1",
      });
      const third = await service.releaseSlot({
        businessId: "business_1",
        humanId: "human_1",
      });

      assert.equal(first.activeLoad, 1);
      assert.equal(second.activeLoad, 2);
      assert.equal(second.state, "OVERLOADED");
      assert.equal(third?.activeLoad, 1);
    },
  },
];
