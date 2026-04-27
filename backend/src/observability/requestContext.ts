import { AsyncLocalStorage } from "async_hooks";

export type RequestContext = {
  requestId: string;
  traceId?: string;
  source?: "http" | "worker" | "webhook";
  route?: string;
  method?: string;
  userId?: string | null;
  businessId?: string | null;
  queueName?: string;
  jobId?: string;
  leadId?: string | null;
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

  if (!context) {
    return {};
  }

  return cleanContext({
      requestId: context.requestId,
      traceId: context.traceId,
      userId: context.userId,
      businessId: context.businessId,
      route: context.route,
    queueName: context.queueName,
    jobId: context.jobId,
    leadId: context.leadId,
    source: context.source,
  });
};
