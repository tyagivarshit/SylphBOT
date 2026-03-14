export const monitoringMiddleware = (
  req: any,
  res: any,
  next: any
) => {

  const ignoredRoutes = [
    "/webhook",
    "/health",
  ];

  if (ignoredRoutes.some((route) => req.originalUrl.startsWith(route))) {
    return next();
  }

  const start = Date.now();

  res.on("finish", () => {

    const duration = Date.now() - start;

    console.log(
      `[MONITOR] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );

  });

  next();

};