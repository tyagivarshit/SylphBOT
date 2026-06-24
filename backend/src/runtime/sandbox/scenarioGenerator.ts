import { SyntheticScenario } from "./types";

export class ScenarioGenerator {
  constructor() {}

  /**
   * Generates a synthetic edge case scenario involving billing queries.
   */
  public generateBillingEdgeCase(tenantId: string): SyntheticScenario {
    return {
      id: `scen_${tenantId}_billing_edge`,
      name: "High-value billing query edge case",
      description: "Synthetic customer asks about pricing plans and attempts payment queries.",
      initialState: {
        budget: 5000,
        activeLeadsCount: 10
      },
      steps: [
        {
          eventId: "evt_msg_received",
          payload: { message: "What is your enterprise license cost?", sender: "USER" }
        },
        {
          eventId: "evt_payment_intent",
          payload: { amount: 8000, currency: "USD" }
        }
      ],
      expectedOutcomes: {
        decision: "escalate",
        riskLevel: "medium"
      }
    };
  }

  /**
   * Generates a synthetic scenario for tool execution failures.
   */
  public generateBookingFailureScenario(tenantId: string): SyntheticScenario {
    return {
      id: `scen_${tenantId}_booking_fail`,
      name: "Simulated booking calendar failure",
      description: "User attempts booking, but calendar sync fails 3 times consecutively.",
      initialState: {
        calendarStatus: "Degraded"
      },
      steps: [
        {
          eventId: "evt_booking_requested",
          payload: { timeSlot: "2026-06-30T10:00:00Z", leadId: "lead_999" }
        }
      ],
      expectedOutcomes: {
        decision: "escalate_to_human",
        fallbackEnabled: true
      }
    };
  }

  /**
   * Generates a list of generic synthetic conversations for load testing.
   */
  public generateStressTestSuite(tenantId: string, count = 10): SyntheticScenario[] {
    const list: SyntheticScenario[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        id: `scen_${tenantId}_stress_${i}`,
        name: `Stress test scenario #${i}`,
        description: "Generated stress test conversational loop",
        initialState: {},
        steps: [
          {
            eventId: "evt_msg_received",
            payload: { message: `Stress query message number ${i}`, sender: "USER" }
          }
        ],
        expectedOutcomes: {}
      });
    }
    return list;
  }
}
