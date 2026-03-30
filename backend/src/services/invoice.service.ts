import { stripe } from "./stripe.service";

/* ================= 🔥 INVOICE NUMBER ================= */

export const generateInvoiceNumber = () => {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  const random = Math.floor(1000 + Math.random() * 9000);

  return `INV-${year}${month}-${random}`;
};

/* ================= 🔥 GET INVOICES ================= */

export const getInvoices = async (customerId: string) => {

  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 10,
  });

  return invoices.data.map((inv) => {

    const invoiceAny = inv as any;

    const taxAmount = Array.isArray(invoiceAny.total_tax_amounts)
      ? invoiceAny.total_tax_amounts.reduce(
          (sum: number, t: any) => sum + (t?.amount || 0),
          0
        )
      : 0;

    return {
      id: inv.id,

      amount: inv.amount_paid ? inv.amount_paid / 100 : 0,

      subtotal: inv.subtotal ? inv.subtotal / 100 : 0,

      tax: taxAmount / 100,

      currency: inv.currency?.toUpperCase() || "USD",

      created: inv.created,

      status: inv.status || "paid",

      hosted_invoice_url: inv.hosted_invoice_url || null,
      invoice_pdf: inv.invoice_pdf || null,
    };
  });
};