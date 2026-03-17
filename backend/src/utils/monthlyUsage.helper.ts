/* ======================================
CURRENT MONTH / YEAR
====================================== */

export const getCurrentMonthYear = () => {

  const now = new Date();

  return {
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };

};

/* ======================================
START OF CURRENT MONTH
====================================== */

export const getStartOfMonth = () => {

  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

};

/* ======================================
END OF CURRENT MONTH
====================================== */

export const getEndOfMonth = () => {

  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59
  );

};