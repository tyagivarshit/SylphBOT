import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  return prisma.bookingSlot.update({
    where: { id },
    data,
  });
};

/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/

export const deleteAvailability = async (id: string) => {
  return prisma.bookingSlot.delete({
    where: { id },
  });
};