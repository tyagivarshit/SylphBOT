export const getTaxConfig = (currency: string) => {

  if (currency === "INR") {
    return {
      automatic_tax: { enabled: true }, // GST
    };
  }

  return {
    automatic_tax: { enabled: true }, // VAT
  };

};