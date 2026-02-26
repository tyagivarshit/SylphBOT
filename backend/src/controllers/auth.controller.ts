import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma";
import generateToken from "../utils/generateToken";

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Duplicate email check
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // Auto-create Business
    const business = await prisma.business.create({
      data: {
        name: `${name}'s Business`,
        ownerId: user.id,
      },
    });

    // 🔥 7-Day Trial Setup
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    // Auto-create Free Subscription (Trial BOTH access)
    await prisma.subscription.create({
      data: {
        businessId: business.id,
        plan: "FREE",
        status: "ACTIVE",
        currentPeriodEnd: trialEnd,
      },
    });

    // Create usage tracker
    await prisma.usage.create({
      data: {
        businessId: business.id,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        messagesUsed: 0,
        leadsUsed: 0,
      },
    });

    const token = generateToken(user.id, user.role);

    res.status(201).json({
      message: "User registered successfully",
      token,
    });
  } catch (error) {
    res.status(500).json({
      message: "Registration failed",
      error,
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user.id, user.role);

    res.json({
      message: "Login successful",
      token,
    });
  } catch (error) {
    res.status(500).json({
      message: "Login failed",
      error,
    });
  }
};