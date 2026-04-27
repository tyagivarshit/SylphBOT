import {
  minDate,
  minutesFrom,
  type InboxRouteTarget,
  type PriorityLevel,
} from "./reception.shared";

export const SLA_POLICY_KEYS = [
  "FIRST_RESPONSE",
  "ESCALATION",
  "REOPEN",
  "COMPLAINT",
  "VIP",
] as const;

export type SlaPolicyKey = (typeof SLA_POLICY_KEYS)[number];

export type SlaPolicyMatrix = {
  firstResponseMinutes: Record<PriorityLevel, number>;
  escalationMinutes: Record<PriorityLevel, number>;
  reopenMinutes: Record<PriorityLevel, number>;
  complaintMinutes: Record<PriorityLevel, number>;
  vipMinutes: Record<PriorityLevel, number>;
};

export type SlaPolicyInput = {
  priorityLevel: PriorityLevel;
  routeDecision: InboxRouteTarget;
  isVip?: boolean;
  isComplaint?: boolean;
  isReopened?: boolean;
  now?: Date;
};

export type SlaPolicyDecision = {
  priorityLevel: PriorityLevel;
  routeDecision: InboxRouteTarget;
  policyKeys: SlaPolicyKey[];
  firstResponseDeadline: Date;
  escalationDeadline: Date;
  reopenDeadline: Date | null;
  effectiveSlaDeadline: Date;
  reasons: string[];
};

export type SlaStatusDecision = {
  status: "ON_TRACK" | "WARNING" | "BREACHED";
  eventType: "sla.warning" | "sla.breached" | null;
  deadline: Date | null;
  remainingMinutes: number | null;
  overdueMinutes: number | null;
  slaKind: SlaPolicyKey | null;
};

export const DEFAULT_SLA_POLICY_MATRIX: SlaPolicyMatrix = {
  firstResponseMinutes: {
    LOW: 120,
    MEDIUM: 60,
    HIGH: 30,
    CRITICAL: 15,
  },
  escalationMinutes: {
    LOW: 240,
    MEDIUM: 120,
    HIGH: 60,
    CRITICAL: 30,
  },
  reopenMinutes: {
    LOW: 60,
    MEDIUM: 45,
    HIGH: 30,
    CRITICAL: 15,
  },
  complaintMinutes: {
    LOW: 60,
    MEDIUM: 30,
    HIGH: 15,
    CRITICAL: 10,
  },
  vipMinutes: {
    LOW: 30,
    MEDIUM: 20,
    HIGH: 10,
    CRITICAL: 5,
  },
};

const resolveFirstResponseMinutes = ({
  matrix,
  priorityLevel,
  isVip,
  isComplaint,
}: {
  matrix: SlaPolicyMatrix;
  priorityLevel: PriorityLevel;
  isVip?: boolean;
  isComplaint?: boolean;
}) => {
  const policyKeys: SlaPolicyKey[] = ["FIRST_RESPONSE"];
  const candidates = [matrix.firstResponseMinutes[priorityLevel]];

  if (isComplaint) {
    candidates.push(matrix.complaintMinutes[priorityLevel]);
    policyKeys.push("COMPLAINT");
  }

  if (isVip) {
    candidates.push(matrix.vipMinutes[priorityLevel]);
    policyKeys.push("VIP");
  }

  return {
    minutes: Math.min(...candidates),
    policyKeys,
  };
};

export const evaluateSlaPolicy = (
  input: SlaPolicyInput,
  matrix: SlaPolicyMatrix = DEFAULT_SLA_POLICY_MATRIX
): SlaPolicyDecision => {
  const now = input.now || new Date();
  const firstResponse = resolveFirstResponseMinutes({
    matrix,
    priorityLevel: input.priorityLevel,
    isVip: input.isVip,
    isComplaint: input.isComplaint,
  });
  const firstResponseDeadline = minutesFrom(now, firstResponse.minutes);
  const escalationDeadline = minutesFrom(
    now,
    Math.min(
      matrix.escalationMinutes[input.priorityLevel],
      input.routeDecision === "ESCALATION"
        ? Math.max(5, Math.floor(matrix.escalationMinutes[input.priorityLevel] / 2))
        : matrix.escalationMinutes[input.priorityLevel]
    )
  );
  const reopenDeadline = input.isReopened
    ? minutesFrom(now, matrix.reopenMinutes[input.priorityLevel])
    : null;
  const effectiveSlaDeadline = minDate(
    reopenDeadline,
    firstResponseDeadline
  ) as Date;
  const reasons = [
    `priority:${input.priorityLevel}`,
    `route:${input.routeDecision}`,
    ...firstResponse.policyKeys.map((key) => `policy:${key}`),
  ];

  if (input.isReopened) {
    reasons.push("policy:REOPEN");
  }

  if (input.routeDecision === "ESCALATION") {
    reasons.push("escalation_route_shortens_deadline");
  }

  return {
    priorityLevel: input.priorityLevel,
    routeDecision: input.routeDecision,
    policyKeys: input.isReopened
      ? [...firstResponse.policyKeys, "REOPEN"]
      : firstResponse.policyKeys,
    firstResponseDeadline,
    escalationDeadline,
    reopenDeadline,
    effectiveSlaDeadline,
    reasons,
  };
};

export const evaluateSlaStatus = ({
  deadline,
  slaKind,
  now = new Date(),
  totalWindowMinutes,
}: {
  deadline: Date | null;
  slaKind: SlaPolicyKey;
  now?: Date;
  totalWindowMinutes: number;
}): SlaStatusDecision => {
  if (!(deadline instanceof Date)) {
    return {
      status: "ON_TRACK",
      eventType: null,
      deadline: null,
      remainingMinutes: null,
      overdueMinutes: null,
      slaKind: null,
    };
  }

  const deltaMinutes = Math.floor((deadline.getTime() - now.getTime()) / 60_000);

  if (deltaMinutes < 0) {
    return {
      status: "BREACHED",
      eventType: "sla.breached",
      deadline,
      remainingMinutes: 0,
      overdueMinutes: Math.abs(deltaMinutes),
      slaKind,
    };
  }

  const warningWindow = Math.max(
    5,
    Math.min(20, Math.ceil(totalWindowMinutes * 0.25))
  );

  if (deltaMinutes <= warningWindow) {
    return {
      status: "WARNING",
      eventType: "sla.warning",
      deadline,
      remainingMinutes: deltaMinutes,
      overdueMinutes: 0,
      slaKind,
    };
  }

  return {
    status: "ON_TRACK",
    eventType: null,
    deadline,
    remainingMinutes: deltaMinutes,
    overdueMinutes: 0,
    slaKind,
  };
};
