export const prewarmState = {
  isCold: true,
  lastRequestAt: Date.now(),
  lastKnownValidSubscription: new Map<string, any>(),
  lastKnownValidBilling: new Map<string, any>(),
  lastKnownValidBootstrap: new Map<string, any>(),
};
