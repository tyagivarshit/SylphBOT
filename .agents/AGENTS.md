# Automexia AI OS Runtime Customizations & Rules

This project-scoped policy defines behavioral constraints and style rules for developers and future agent conversations working on the Automexia codebase.

## 1. Runtime Core Immutability (Stage 2.10 Freeze)

> [!IMPORTANT]
> The Universal Core Runtime is **FROZEN** and must be treated as immutable.
> * Files under [backend/src/runtime/](file:///D:/sylph-ai/backend/src/runtime) (including kernel, oig, governance, communication, execution, models, intelligence, and sandbox) must **NOT** be modified directly.
> * Any code updates or enhancements must be achieved via **dynamic Plugins** registering through [IPluginRegistry](file:///D:/sylph-ai/backend/src/runtime/interfaces/universal.ts) or higher-level business services.
> * Executive AIs and workspace tools must consume runtime capabilities through interfaces like [IOrganizationGraph](file:///D:/sylph-ai/backend/src/runtime/interfaces/universal.ts) and [ISemanticResolutionLayer](file:///D:/sylph-ai/backend/src/runtime/governance/interfaces.ts) rather than direct database manipulations.

## 2. Dynamic Plugin Architecture

* All new plugins must inherit from the `IDomainPlugin` interface.
* Plugins must implement lifecycle events (`onRegister`, `onUnregister`) to hook into core DI bindings cleanly.
* Do not register duplicate services or bypass DI container mapping.

## 3. Privacy & Redaction Guidelines

* Any write operation to OIG, Event Bus, or Audit logs must check properties for PII (phone numbers, email addresses).
* Ensure that the automatic regex-based redact sanitization in [oigEngine.ts](file:///D:/sylph-ai/backend/src/runtime/oig/oigEngine.ts) is leveraged for node properties, event payloads, and audit metadata.

## 4. Multi-Tenant Isolation

* Every access layer must propagate the current `tenantId` (or `businessId`) inside the `RequestContext` AsyncLocalStorage wrapper.
* Direct cross-tenant traversals are strictly prohibited and will raise security violations.

---
