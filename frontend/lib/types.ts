export type ApiResponse<T> = {
  success: boolean;
  data: T | null;

  /* SaaS Meta */
  limited?: boolean;
  upgradeRequired?: boolean;
  unauthorized?: boolean;
  networkError?: boolean;

  message?: string;
};