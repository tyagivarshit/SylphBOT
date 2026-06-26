export interface IConnector {
  getConnectorType(): string;
  getProviderName(): string;
  isHealthy(): Promise<boolean>;
}

// 1. Invoice Connector
export interface IInvoiceConnector extends IConnector {
  createInvoice(invoiceData: {
    customerId: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }>;
    currency: string;
    dueDate?: Date;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; invoiceNumber: string; totalAmount: number; status: string; rawResponse: any }>;

  getInvoice(id: string): Promise<{ id: string; invoiceNumber: string; totalAmount: number; status: string; rawResponse: any } | null>;

  updateInvoice(id: string, invoiceData: Partial<{
    items: Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }>;
    metadata?: Record<string, any>;
  }>): Promise<{ id: string; status: string; rawResponse: any }>;

  voidInvoice(id: string): Promise<{ id: string; status: string; rawResponse: any }>;

  listInvoices(filter?: {
    customerId?: string;
    status?: string;
    limit?: number;
  }): Promise<Array<{ id: string; invoiceNumber: string; totalAmount: number; status: string }>>;
}

// 2. Payment Connector
export interface IPaymentConnector extends IConnector {
  charge(chargeData: {
    amount: number;
    currency: string;
    paymentMethodId: string;
    customerId?: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<{ transactionId: string; amount: number; status: "succeeded" | "failed" | "pending"; rawResponse: any }>;

  refund(paymentId: string, amount?: number): Promise<{ refundId: string; amountRefunded: number; status: string; rawResponse: any }>;

  getPayment(paymentId: string): Promise<{ transactionId: string; amount: number; status: string; rawResponse: any } | null>;

  listPayments(filter?: {
    customerId?: string;
    status?: string;
    limit?: number;
  }): Promise<Array<{ transactionId: string; amount: number; status: string }>>;
}

// 3. Conversation Connector
export interface IConversationConnector extends IConnector {
  sendMessage(chatId: string, message: {
    senderId: string;
    content: string;
    contentType?: "text" | "image" | "file";
    metadata?: Record<string, any>;
  }): Promise<{ messageId: string; sentAt: Date; rawResponse: any }>;

  getMessages(chatId: string, limit?: number): Promise<Array<{
    messageId: string;
    senderId: string;
    content: string;
    sentAt: Date;
    rawResponse: any;
  }>>;

  createChat(chatData: {
    participants: string[];
    metadata?: Record<string, any>;
  }): Promise<{ chatId: string; status: string; rawResponse: any }>;

  closeChat(chatId: string): Promise<{ chatId: string; status: string; rawResponse: any }>;
}

// 4. Booking Connector
export interface IBookingConnector extends IConnector {
  createBooking(bookingData: {
    resourceId: string;
    customerId: string;
    startAt: Date;
    endAt: Date;
    metadata?: Record<string, any>;
  }): Promise<{ bookingId: string; status: string; rawResponse: any }>;

  getBooking(id: string): Promise<{ bookingId: string; startAt: Date; endAt: Date; status: string; rawResponse: any } | null>;

  cancelBooking(id: string, reason?: string): Promise<{ bookingId: string; status: string; rawResponse: any }>;

  updateBooking(id: string, bookingData: Partial<{
    startAt: Date;
    endAt: Date;
    status: string;
    metadata?: Record<string, any>;
  }>): Promise<{ bookingId: string; status: string; rawResponse: any }>;

  listBookings(filter?: {
    customerId?: string;
    resourceId?: string;
    startAfter?: Date;
    limit?: number;
  }): Promise<Array<{ bookingId: string; startAt: Date; endAt: Date; status: string }>>;
}

// 5. Campaign Connector
export interface ICampaignConnector extends IConnector {
  createCampaign(campaignData: {
    name: string;
    channel: "email" | "sms" | "whatsapp" | "ads";
    contentTemplate: string;
    audienceSegmentId: string;
    metadata?: Record<string, any>;
  }): Promise<{ campaignId: string; status: string; rawResponse: any }>;

  startCampaign(id: string): Promise<{ campaignId: string; status: string; rawResponse: any }>;

  stopCampaign(id: string): Promise<{ campaignId: string; status: string; rawResponse: any }>;

  getCampaignStats(id: string): Promise<{
    campaignId: string;
    sentCount: number;
    deliveredCount: number;
    clickedCount: number;
    convertedCount: number;
    rawResponse: any;
  }>;
}

// 6. CRM Connector
export interface ICrmConnector extends IConnector {
  createContact(contactData: {
    firstName: string;
    lastName?: string;
    email: string;
    phone?: string;
    company?: string;
    metadata?: Record<string, any>;
  }): Promise<{ contactId: string; status: string; rawResponse: any }>;

  getContact(id: string): Promise<{ contactId: string; firstName: string; email: string; rawResponse: any } | null>;

  updateContact(id: string, contactData: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    company: string;
    metadata: Record<string, any>;
  }>): Promise<{ contactId: string; status: string; rawResponse: any }>;

  deleteContact(id: string): Promise<{ contactId: string; status: string; rawResponse: any }>;

  listContacts(filter?: {
    email?: string;
    company?: string;
    limit?: number;
  }): Promise<Array<{ contactId: string; firstName: string; email: string }>>;
}

// 7. Knowledge Connector
export interface IKnowledgeConnector extends IConnector {
  queryKnowledge(query: string, filter?: {
    categories?: string[];
    tags?: string[];
    limit?: number;
  }): Promise<Array<{
    documentId: string;
    title: string;
    snippet: string;
    score: number;
    rawResponse: any;
  }>>;

  ingestDocument(doc: {
    title: string;
    content: string;
    category?: string;
    tags?: string[];
    metadata?: Record<string, any>;
  }): Promise<{ documentId: string; status: string; rawResponse: any }>;

  deleteDocument(id: string): Promise<{ documentId: string; status: string; rawResponse: any }>;
}

// 8. Support Ticket Connector
export interface ISupportTicketConnector extends IConnector {
  createTicket(ticketData: {
    customerId: string;
    subject: string;
    description: string;
    priority?: "low" | "medium" | "high" | "urgent";
    metadata?: Record<string, any>;
  }): Promise<{ ticketId: string; ticketNumber: string; status: string; rawResponse: any }>;

  getTicket(id: string): Promise<{ ticketId: string; ticketNumber: string; status: string; rawResponse: any } | null>;

  updateTicket(id: string, ticketData: Partial<{
    status: string;
    priority: "low" | "medium" | "high" | "urgent";
    assignedAgentId: string;
    metadata: Record<string, any>;
  }>): Promise<{ ticketId: string; status: string; rawResponse: any }>;

  resolveTicket(id: string, solution?: string): Promise<{ ticketId: string; status: string; rawResponse: any }>;
}

// 9. Revenue Connector
export interface IRevenueConnector extends IConnector {
  recordRevenue(revenueData: {
    amount: number;
    currency: string;
    source: string; // e.g. sales, subscription, investment
    recordedAt: Date;
    referenceId?: string; // invoice or payment ID
    metadata?: Record<string, any>;
  }): Promise<{ revenueId: string; status: string; rawResponse: any }>;

  getRevenueReport(timeframe: {
    startAt: Date;
    endAt: Date;
  }): Promise<{
    totalRevenue: number;
    currency: string;
    breakdownBySource: Record<string, number>;
    rawResponse: any;
  }>;
}

// 10. Expense Connector
export interface IExpenseConnector extends IConnector {
  recordExpense(expenseData: {
    amount: number;
    currency: string;
    category: string; // e.g. software, office, salaries
    vendorId?: string;
    recordedAt: Date;
    metadata?: Record<string, any>;
  }): Promise<{ expenseId: string; status: string; rawResponse: any }>;

  getExpenseReport(timeframe: {
    startAt: Date;
    endAt: Date;
  }): Promise<{
    totalExpense: number;
    currency: string;
    breakdownByCategory: Record<string, number>;
    rawResponse: any;
  }>;
}

// 11. Vendor Connector
export interface IVendorConnector extends IConnector {
  createVendor(vendorData: {
    name: string;
    contactPerson?: string;
    email: string;
    phone?: string;
    address?: string;
    metadata?: Record<string, any>;
  }): Promise<{ vendorId: string; status: string; rawResponse: any }>;

  getVendor(id: string): Promise<{ vendorId: string; name: string; email: string; rawResponse: any } | null>;

  updateVendor(id: string, vendorData: Partial<{
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    metadata: Record<string, any>;
  }>): Promise<{ vendorId: string; status: string; rawResponse: any }>;

  deleteVendor(id: string): Promise<{ vendorId: string; status: string; rawResponse: any }>;
}

// 12. Employee Connector
export interface IEmployeeConnector extends IConnector {
  createEmployee(employeeData: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    department?: string;
    hireDate?: Date;
    metadata?: Record<string, any>;
  }): Promise<{ employeeId: string; status: string; rawResponse: any }>;

  getEmployee(id: string): Promise<{ employeeId: string; firstName: string; role: string; rawResponse: any } | null>;

  updateEmployee(id: string, employeeData: Partial<{
    firstName: string;
    lastName: string;
    role: string;
    department: string;
    metadata: Record<string, any>;
  }>): Promise<{ employeeId: string; status: string; rawResponse: any }>;

  terminateEmployee(id: string, details?: {
    terminationDate: Date;
    reason?: string;
  }): Promise<{ employeeId: string; status: string; rawResponse: any }>;
}
