import jwt from "jsonwebtoken";

const generateToken = (userId: string, role: string) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );
};

export default generateToken;