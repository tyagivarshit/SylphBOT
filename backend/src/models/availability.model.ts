import prisma from "../config/prisma";

/*
=====================================================
CREATE AVAILABILITY
=====================================================
*/

export const createAvailability = async (data: {
  businessId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration?: number; // in minutes
  bufferTime?: number; // in minutes
  timezone?: string;
}) => {
  return prisma.bookingSlot.create({
    data: {
      businessId: data.businessId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      slotDuration: data.slotDuration ?? 30,
      bufferTime: data.bufferTime ?? 0,
      timezone: data.timezone ?? "UTC",
      isActive: true,
    },
  });
};

/*
=====================================================
GET AVAILABILITY
=====================================================
*/

export const getAvailability = async (businessId: string) => {
  return prisma.bookingSlot.findMany({
    where: { businessId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
};

/*
=====================================================
UPDATE AVAILABILITY
=====================================================
*/

export const updateAvailability = async (
  businessId: string,
  id: string,
  data: Partial<{
    startTime: string;
    endTime: string;
    slotDuration: number;
    bufferTime: number;
    timezone: string;
    isActive: boolean;
  }>
) => {
  const availability = await prisma.bookingSlot.findFirst({
    where: {
      id,
      businessId,
    },
  });

  if (!availability) {
    return null;
  }

  await prisma.bookingSlot.updateMany({
    where: {
      id: availability.id,
      businessId,
    },
    data,
  });

  return prisma.bookingSlot.findFirst({
    where: {
      id: availability.id,
      businessId,
    },
  });
};

/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/

export const deleteAvailability = async (businessId: string, id: string) => {
  const availability = await prisma.bookingSlot.findFirst({
    where: {
      id,
      businessId,
    },
    select: {
      id: true,
    },
  });

  if (!availability) {
    return null;
  }

  await prisma.bookingSlot.deleteMany({
    where: {
      id: availability.id,
      businessId,
    },
  });

  return availability;
};
