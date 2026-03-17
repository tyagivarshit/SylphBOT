import { stripe } from "./stripe.service";

export const getInvoices = async (customerId: string) => {

  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 10,
  });

  return invoices.data.map(inv => ({

    id: inv.id,

    // ✅ FIX: safe amount
    amount: inv.amount_paid ? inv.amount_paid / 100 : 0,

    // ✅ FIX: uppercase for UI
    currency: inv.currency?.toUpperCase() || "USD",

    // ✅ FIX: raw timestamp bhejo (frontend handle karega)
    date: inv.created,

    // ✅ status
    status: inv.status || "paid",

    // ✅ 🔥 MAIN FIX: pdf link
    pdf: inv.invoice_pdf || inv.hosted_invoice_url || null,

  }));

};