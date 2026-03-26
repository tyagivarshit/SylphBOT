import { fetchAvailableSlots } from "./booking.service";

interface SlotResult {
  date: Date;
  slots: Date[];
}

export const fetchNext30DaysSlots = async (
  businessId: string
): Promise<SlotResult[]> => {
  try {
    const results: SlotResult[] = [];

    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const currentDate = new Date();
      currentDate.setDate(today.getDate() + i);
      currentDate.setHours(0, 0, 0, 0);

      let slots: Date[] = [];

      try {
        slots = await fetchAvailableSlots(
          businessId,
          currentDate
        );
      } catch (error) {
        console.error(
          "SLOT FETCH ERROR:",
          businessId,
          currentDate,
          error
        );
        continue;
      }

      if (!slots || slots.length === 0) continue;

      /* 🔥 FILTER PAST SLOTS (EXTRA SAFETY) */
      const validSlots = slots.filter(
        (s) => s.getTime() > Date.now()
      );

      if (!validSlots.length) continue;

      results.push({
        date: currentDate,
        slots: validSlots,
      });
    }

    /* 🔥 SORT ALL SLOTS (GLOBAL ORDER) */
    results.forEach((day) => {
      day.slots.sort(
        (a, b) => a.getTime() - b.getTime()
      );
    });

    return results;

  } catch (error) {
    console.error(
      "FETCH 30 DAYS SLOTS ERROR:",
      error
    );
    return [];
  }
};