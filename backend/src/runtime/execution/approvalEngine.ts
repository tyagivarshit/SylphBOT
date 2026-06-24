import { ApprovalRequest } from "./types";

export class ApprovalEngine {
  private requests = new Map<string, ApprovalRequest>();

  constructor() {}

  /**
   * Creates a new approval request in pending state.
   */
  public createRequest(
    tenantId: string,
    executionId: string,
    requesterId: string,
    stepsRequired = 1,
    payload: any = {}
  ): ApprovalRequest {
    const id = `appr_${tenantId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const request: ApprovalRequest = {
      id,
      tenantId,
      executionId,
      status: "pending",
      requesterId,
      stepsRequired,
      stepsCompleted: 0,
      auditTrail: [`[${new Date().toISOString()}] Approval request created by ${requesterId}`],
      payload
    };

    this.requests.set(id, request);
    return request;
  }

  /**
   * Approve a request step.
   */
  public approve(requestId: string, approverId: string): ApprovalRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request with ID [${requestId}] not found.`);
    }

    if (request.status !== "pending") {
      throw new Error(`Approval request is already [${request.status}].`);
    }

    request.stepsCompleted++;
    request.auditTrail.push(
      `[${new Date().toISOString()}] Approved step ${request.stepsCompleted}/${request.stepsRequired} by ${approverId}`
    );

    if (request.stepsCompleted >= request.stepsRequired) {
      request.status = "approved";
      request.approverId = approverId;
      request.auditTrail.push(`[${new Date().toISOString()}] Request fully approved.`);
    }

    this.requests.set(requestId, request);
    return request;
  }

  /**
   * Reject an approval request.
   */
  public reject(requestId: string, approverId: string): ApprovalRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Approval request with ID [${requestId}] not found.`);
    }

    if (request.status !== "pending") {
      throw new Error(`Approval request is already [${request.status}].`);
    }

    request.status = "rejected";
    request.approverId = approverId;
    request.auditTrail.push(`[${new Date().toISOString()}] Request rejected by ${approverId}`);

    this.requests.set(requestId, request);
    return request;
  }

  /**
   * Retrieves an approval request.
   */
  public getRequest(requestId: string): ApprovalRequest | null {
    return this.requests.get(requestId) || null;
  }

  /**
   * Verifies if a request is approved.
   */
  public isApproved(requestId: string): boolean {
    const request = this.requests.get(requestId);
    return request ? request.status === "approved" : false;
  }

  /**
   * Processes approvals for a list of requests in batch.
   */
  public batchApprove(requestIds: string[], approverId: string): ApprovalRequest[] {
    return requestIds.map(id => this.approve(id, approverId));
  }
}
