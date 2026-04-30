import { AsyncLocalStorage } from "async_hooks";
import {
  RELIABILITY_PHASE_VERSION,
  createStructuredLogDefaults,
} from "./logSchema";

export type RequestContext = {
  requestId: string;
  traceId?: string;
  correlationId?: string;
  tenantId?: string | null;
  source?: "http" | "worker" | "webhook";
  route?: string;
  method?: string;
  userId?: string | null;
  businessId?: string | null;
  queueName?: string;
  jobId?: string;
  leadId?: string | null;
  interactionId?: string | null;
  appointmentId?: string | null;
  proposalId?: string | null;
  contractId?: string | null;
  paymentId?: string | null;
  queueJobId?: string | null;
  workerId?: string | null;
  provider?: string | null;
  component?: string | null;
  phase?: string | null;
  version?: string | null;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

const cleanContext = (
  context: Partial<RequestContext>
): Partial<RequestContext> =>
  Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined)
  ) as Partial<RequestContext>;

export const runWithRequestContext = <T>(
  context: RequestContext,
  callback: () => T
) => requestContextStorage.run(cleanContext(context) as RequestContext, callback);

export const getRequestContext = () => requestContextStorage.getStore();

export const updateRequestContext = (context: Partial<RequestContext>) => {
  const store = requestContextStorage.getStore();

  if (!store) {
    return undefined;
  }

  Object.assign(store, cleanContext(context));
  return store;
};

export const buildContextBindings = () => {
  const context = getRequestContext();
  const defaults = createStructuredLogDefaults("info");

  if (!context) {
    return defaults;
  }

  const structured = {
    ...defaults,
    traceId: context.traceId || context.requestId,
    correlationId: context.correlationId || context.requestId,
    tenantId: context.tenantId || context.businessId || null,
    leadId: context.leadId || null,
    interactionId: context.interactionId || null,
    appointmentId: context.appointmentId || null,
    proposalId: context.proposalId || null,
    contractId: context.contractId || null,
    paymentId: context.paymentId || null,
    queueJobId: context.queueJobId || context.jobId || null,
    workerId: context.workerId || null,
    provider: context.provider || null,
    component: context.component || context.source || "runtime",
    phase: context.phase || "operations",
    version: context.version || RELIABILITY_PHASE_VERSION,
  };

  return {
    ...structured,
    ...cleanContext({
      requestId: context.requestId,
      userId: context.userId,
      businessId: context.businessId,
      route: context.route,
      queueName: context.queueName,
      jobId: context.jobId,
      source: context.source,
    }),
  };
};
