import {
  IExecutiveIdentity,
  IExecutiveDNA,
  IExecutiveCapabilityProfile,
  IDecisionAuthorityMatrix,
  IBusinessOutcome,
  IExecutiveHealth,
  IMissionState,
  ExecutiveLifecycleState
} from "./interfaces";

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

export function validateExecutiveDNA(dna: IExecutiveDNA): ValidationResult {
  const issues: string[] = [];

  // Role validation
  if (!dna.role || typeof dna.role !== "string" || dna.role.trim() === "") {
    issues.push("DNA: Role is required and must be a non-empty string.");
  }

  // Version validation
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
  if (!dna.version || !semverRegex.test(dna.version)) {
    issues.push(`DNA: Version [${dna.version}] must follow semantic versioning rules (x.y.z).`);
  }

  // Mission validation
  if (!dna.mission) {
    issues.push("DNA: Mission is required.");
  } else {
    if (!dna.mission.vision || dna.mission.vision.trim() === "") {
      issues.push("DNA Mission: Vision is required and must not be empty.");
    }
    if (!Array.isArray(dna.mission.directives) || dna.mission.directives.length === 0) {
      issues.push("DNA Mission: Directives must be a non-empty array.");
    }
    if (!Array.isArray(dna.mission.alignmentTargets)) {
      issues.push("DNA Mission: Alignment targets must be an array.");
    }
  }

  // Responsibilities validation
  if (!Array.isArray(dna.responsibilities)) {
    issues.push("DNA: Responsibilities must be an array.");
  } else {
    const respIds = new Set<string>();
    for (const resp of dna.responsibilities) {
      if (!resp.id || typeof resp.id !== "string") {
        issues.push("DNA Responsibility: ID is required.");
      } else if (respIds.has(resp.id)) {
        issues.push(`DNA Responsibility: Duplicate responsibility ID [${resp.id}].`);
      } else {
        respIds.add(resp.id);
      }
      if (!resp.title || resp.title.trim() === "") {
        issues.push(`DNA Responsibility [${resp.id || "unknown"}]: Title is required.`);
      }
      if (!resp.domain || resp.domain.trim() === "") {
        issues.push(`DNA Responsibility [${resp.id || "unknown"}]: Domain is required.`);
      }
    }
  }

  // Authorities validation (legacy)
  if (dna.authorities && !Array.isArray(dna.authorities)) {
    issues.push("DNA: Authorities must be an array.");
  } else if (dna.authorities) {
    const authIds = new Set<string>();
    for (const auth of dna.authorities) {
      if (!auth.id || typeof auth.id !== "string") {
        issues.push("DNA Authority: ID is required.");
      } else if (authIds.has(auth.id)) {
        issues.push(`DNA Authority: Duplicate authority ID [${auth.id}].`);
      } else {
        authIds.add(auth.id);
      }
      if (!auth.action || auth.action.trim() === "") {
        issues.push(`DNA Authority [${auth.id || "unknown"}]: Action is required.`);
      }
    }
  }

  // Boundaries validation
  if (!Array.isArray(dna.boundaries)) {
    issues.push("DNA: Boundaries must be an array.");
  } else {
    const boundIds = new Set<string>();
    for (const bound of dna.boundaries) {
      if (!bound.id || typeof bound.id !== "string") {
        issues.push("DNA Boundary: ID is required.");
      } else if (boundIds.has(bound.id)) {
        issues.push(`DNA Boundary: Duplicate boundary ID [${bound.id}].`);
      } else {
        boundIds.add(bound.id);
      }
      if (!bound.rule || bound.rule.trim() === "") {
        issues.push(`DNA Boundary [${bound.id || "unknown"}]: Rule is required.`);
      }
    }
  }

  // KPI Ownership validation
  if (!Array.isArray(dna.kpiOwnership)) {
    issues.push("DNA: KPI Ownership must be an array.");
  } else {
    const kpiIds = new Set<string>();
    for (const kpi of dna.kpiOwnership) {
      if (!kpi.id || typeof kpi.id !== "string") {
        issues.push("DNA KPI: ID is required.");
      } else if (kpiIds.has(kpi.id)) {
        issues.push(`DNA KPI: Duplicate KPI ID [${kpi.id}].`);
      } else {
        kpiIds.add(kpi.id);
      }
      if (!kpi.name || kpi.name.trim() === "") {
        issues.push(`DNA KPI [${kpi.id || "unknown"}]: Name is required.`);
      }
      if (!kpi.metricToken || kpi.metricToken.trim() === "") {
        issues.push(`DNA KPI [${kpi.id || "unknown"}]: Metric Token is required.`);
      }
    }
  }

  // Decision Scope validation
  if (!Array.isArray(dna.decisionScope)) {
    issues.push("DNA: Decision Scope must be an array.");
  } else {
    const scopeIds = new Set<string>();
    for (const scope of dna.decisionScope) {
      if (!scope.id || typeof scope.id !== "string") {
        issues.push("DNA Decision Scope: ID is required.");
      } else if (scopeIds.has(scope.id)) {
        issues.push(`DNA Decision Scope: Duplicate decision scope ID [${scope.id}].`);
      } else {
        scopeIds.add(scope.id);
      }
      if (!["strategic", "tactical", "operational"].includes(scope.decisionType)) {
        issues.push(`DNA Decision Scope [${scope.id || "unknown"}]: Invalid decision type [${scope.decisionType}].`);
      }
    }
  }

  // Communication Profile validation
  if (!dna.communicationProfile) {
    issues.push("DNA: Communication Profile is required.");
  } else {
    const cp = dna.communicationProfile;
    if (!cp.style || cp.style.trim() === "") {
      issues.push("DNA Comm Profile: Style is required.");
    }
    if (!cp.tone || cp.tone.trim() === "") {
      issues.push("DNA Comm Profile: Tone is required.");
    }
    if (!["realtime", "batched", "on_demand"].includes(cp.frequency)) {
      issues.push(`DNA Comm Profile: Invalid frequency [${cp.frequency}].`);
    }
  }

  // Delegation Profile validation
  if (!dna.delegationProfile) {
    issues.push("DNA: Delegation Profile is required.");
  }

  // Escalation Profile validation
  if (!dna.escalationProfile) {
    issues.push("DNA: Escalation Profile is required.");
  } else {
    const ep = dna.escalationProfile;
    if (!Array.isArray(ep.escalationTriggers)) {
      issues.push("DNA Escalation Profile: Escalation triggers must be an array.");
    }
    if (!Array.isArray(ep.notificationTargets)) {
      issues.push("DNA Escalation Profile: Notification targets must be an array.");
    }
    if (typeof ep.gracePeriodMs !== "number" || ep.gracePeriodMs < 0) {
      issues.push("DNA Escalation Profile: Grace period must be a non-negative number.");
    }
  }

  // Success Criteria validation
  if (!Array.isArray(dna.successCriteria)) {
    issues.push("DNA: Success Criteria must be an array.");
  } else {
    const scIds = new Set<string>();
    for (const sc of dna.successCriteria) {
      if (!sc.id || typeof sc.id !== "string") {
        issues.push("DNA Success Criteria: ID is required.");
      } else if (scIds.has(sc.id)) {
        issues.push(`DNA Success Criteria: Duplicate ID [${sc.id}].`);
      } else {
        scIds.add(sc.id);
      }
    }
  }

  // Failure Criteria validation
  if (!Array.isArray(dna.failureCriteria)) {
    issues.push("DNA: Failure Criteria must be an array.");
  } else {
    const fcIds = new Set<string>();
    for (const fc of dna.failureCriteria) {
      if (!fc.id || typeof fc.id !== "string") {
        issues.push("DNA Failure Criteria: ID is required.");
      } else if (fcIds.has(fc.id)) {
        issues.push(`DNA Failure Criteria: Duplicate ID [${fc.id}].`);
      } else {
        fcIds.add(fc.id);
      }
      if (typeof fc.consecutiveOccurrences !== "number" || fc.consecutiveOccurrences < 1) {
        issues.push(`DNA Failure Criteria [${fc.id || "unknown"}]: Consecutive occurrences must be at least 1.`);
      }
    }
  }

  // Personality Model validation
  if (!dna.personalityModel) {
    issues.push("DNA: Personality Model is required.");
  } else {
    const pm = dna.personalityModel;
    if (!pm.traits || typeof pm.traits !== "object") {
      issues.push("DNA Personality: Traits must be an object.");
    } else {
      for (const [trait, value] of Object.entries(pm.traits)) {
        if (typeof value !== "number" || value < 0.0 || value > 1.0) {
          issues.push(`DNA Personality Trait [${trait}]: Value [${value}] must be between 0.0 and 1.0.`);
        }
      }
    }
    if (!["analytical", "consensus", "directive", "conceptual"].includes(pm.decisionStyle)) {
      issues.push(`DNA Personality: Invalid decision style [${pm.decisionStyle}].`);
    }

    // Extended traits validation (optional for backward compatibility, but must be numeric if present)
    const traitsToCheck = [
      "analyticalDepth",
      "creativity",
      "riskAppetite",
      "decisionSpeed",
      "evidenceRequirement",
      "collaborationTendency",
      "autonomyLevel",
      "adaptability"
    ];
    for (const trait of traitsToCheck) {
      const val = (pm as any)[trait];
      if (val !== undefined && (typeof val !== "number" || val < 0.0 || val > 1.0)) {
        issues.push(`DNA Personality Trait [${trait}]: Value [${val}] must be between 0.0 and 1.0.`);
      }
    }
  }

  // Capability Profile validation
  if (dna.capabilityProfile) {
    const cp = dna.capabilityProfile;
    if (!Array.isArray(cp.allowedDecisionCategories)) {
      issues.push("DNA Capability Profile: allowedDecisionCategories must be an array.");
    } else {
      for (const category of cp.allowedDecisionCategories) {
        if (!["operational", "tactical", "strategic"].includes(category)) {
          issues.push(`DNA Capability Profile: Invalid decision category [${category}].`);
        }
      }
    }
    if (!Array.isArray(cp.allowedReasoningDomains)) {
      issues.push("DNA Capability Profile: allowedReasoningDomains must be an array.");
    }
    if (!Array.isArray(cp.executableCapabilities)) {
      issues.push("DNA Capability Profile: executableCapabilities must be an array.");
    }
  }

  // Decision Authority Matrix validation
  if (dna.decisionAuthorityMatrix) {
    const matrix = dna.decisionAuthorityMatrix;
    if (!Array.isArray(matrix.rules)) {
      issues.push("DNA Decision Authority Matrix: rules must be an array.");
    } else {
      for (const rule of matrix.rules) {
        if (!rule.action || typeof rule.action !== "string" || rule.action.trim() === "") {
          issues.push("DNA Decision Authority Rule: action is required.");
        }
        if (rule.approvalRequired === undefined) {
          issues.push(`DNA Decision Authority Rule [${rule.action || "unknown"}]: approvalRequired is required.`);
        }
      }
    }
  }

  // Business Outcomes validation
  if (dna.businessOutcomes) {
    if (!Array.isArray(dna.businessOutcomes)) {
      issues.push("DNA Business Outcomes: must be an array.");
    } else {
      const outcomeIds = new Set<string>();
      const validCategories = [
        "GROWTH",
        "EFFICIENCY",
        "CUSTOMER_SUCCESS",
        "RISK_REDUCTION",
        "OPERATIONAL_EXCELLENCE",
        "COST_OPTIMIZATION",
        "REVENUE_IMPROVEMENT",
        "RETENTION_IMPROVEMENT",
        "BUSINESS_HEALTH"
      ];
      for (const outcome of dna.businessOutcomes) {
        if (!outcome.id || typeof outcome.id !== "string") {
          issues.push("DNA Business Outcome: id is required.");
        } else if (outcomeIds.has(outcome.id)) {
          issues.push(`DNA Business Outcome: Duplicate ID [${outcome.id}].`);
        } else {
          outcomeIds.add(outcome.id);
        }
        if (!outcome.name || outcome.name.trim() === "") {
          issues.push(`DNA Business Outcome [${outcome.id || "unknown"}]: name is required.`);
        }
        if (!validCategories.includes(outcome.category)) {
          issues.push(`DNA Business Outcome [${outcome.id || "unknown"}]: Invalid category [${outcome.category}].`);
        }
        if (typeof outcome.weight !== "number" || outcome.weight < 0.0 || outcome.weight > 1.0) {
          issues.push(`DNA Business Outcome [${outcome.id || "unknown"}]: weight [${outcome.weight}] must be between 0.0 and 1.0.`);
        }
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

export function validateExecutiveIdentity(identity: IExecutiveIdentity): ValidationResult {
  const issues: string[] = [];

  // ID validation
  if (!identity.id || typeof identity.id !== "string" || !identity.id.startsWith("exec_")) {
    issues.push(`Identity: ID [${identity.id || "unknown"}] is invalid; must start with "exec_".`);
  }

  // Tenant ID validation
  if (!identity.tenantId || typeof identity.tenantId !== "string" || identity.tenantId.trim() === "") {
    issues.push("Identity: Tenant ID is required and must not be empty.");
  }

  // Name validation
  if (!identity.name || typeof identity.name !== "string" || identity.name.trim() === "") {
    issues.push("Identity: Name is required.");
  }

  // Status validation
  const validStatuses: ExecutiveLifecycleState[] = [
    "DRAFT",
    "CONFIGURED",
    "LEARNING",
    "ACTIVE",
    "REVIEW",
    "OPTIMIZING",
    "SUSPENDED",
    "RETIRED",
    "STANDBY",
    "WARNING",
    "OBSERVATION",
    "RECOVERY"
  ];
  if (!validStatuses.includes(identity.status)) {
    issues.push(`Identity: Invalid status [${identity.status}].`);
  }

  // DNA validation
  if (!identity.dna) {
    issues.push("Identity: DNA is required.");
  } else {
    const dnaResult = validateExecutiveDNA(identity.dna);
    if (!dnaResult.isValid) {
      issues.push(...dnaResult.issues);
    }
    if (identity.role !== identity.dna.role) {
      issues.push(`Identity: Role mismatch; identity role [${identity.role}] must match DNA role [${identity.dna.role}].`);
    }
  }

  // Health model validation
  if (identity.health) {
    if (!["HEALTHY", "DEGRADED", "CRITICAL"].includes(identity.health.status)) {
      issues.push(`Identity Health: Invalid status [${identity.health.status}].`);
    }
    if (typeof identity.health.score !== "number" || identity.health.score < 0 || identity.health.score > 100) {
      issues.push(`Identity Health: Score [${identity.health.score}] must be between 0 and 100.`);
    }
  }

  // Mission State validation
  if (identity.missionState) {
    if (!Array.isArray(identity.missionState.currentDirectives)) {
      issues.push("Identity Mission State: currentDirectives must be an array.");
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
