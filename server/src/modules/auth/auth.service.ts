import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { authRepository } from "./auth.repository.js";

// Compared against when the username does not exist, so a failed login
// takes about the same time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export const authService = {
  async login(username: string, password: string) {
    const user = await authRepository.findUserByUsername(username);
    const matches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

    if (!user || !matches) {
      throw new HttpError(401, "Invalid username or password");
    }

    const tier = user.role as "admin" | "staff" | "resident";
    const token = jwt.sign(
      {
        tier,
        staffId: user.staff_id ?? undefined,
        residentId: user.resident_id ?? undefined,
      },
      env.jwtSecret,
      {
        subject: String(user.user_id),
        expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
      },
    );

    return {
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        staff_id: user.staff_id,
        resident_id: user.resident_id,
      },
    };
  },
};
