import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import logger from "./logger";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: any): boolean => {
  // Network failures (no response)
  if (!error.response) {
    return true;
  }

  // Timeout (Axios timeout code is 'ECONNABORTED' or 'ETIMEDOUT')
  if (
    error.code === "ECONNABORTED" ||
    error.code === "ETIMEDOUT" ||
    error.message?.toLowerCase().includes("timeout")
  ) {
    return true;
  }

  // 5xx Meta errors
  const status = error.response.status;
  if (status >= 500) {
    return true;
  }

  // Meta Graph API error codes that are transient
  const metaError = error.response.data?.error;
  if (metaError) {
    const code = Number(metaError.code);
    if ([1, 2, 4, 17, 341].includes(code)) {
      return true;
    }
  }

  return false;
};

export const axiosWithMetaRetry = async (
  config: AxiosRequestConfig,
  stage: string
): Promise<AxiosResponse> => {
  const delays = [500, 1500];
  let attempt = 1;

  while (true) {
    try {
      return await axios(config);
    } catch (error: any) {
      if (attempt <= delays.length && isRetryableError(error)) {
        const delay = delays[attempt - 1];
        logger.warn({
          stage,
          message: `Meta Graph API request failed. Retrying in ${delay}ms.`,
          attempt,
          error: error.message,
          status: error.response?.status,
        });
        await sleep(delay);
        attempt++;
      } else {
        throw error;
      }
    }
  }
};
