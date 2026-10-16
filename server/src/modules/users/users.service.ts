import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { RequestContext } from "../../db/withRequestContext.js";
import { usersRepository } from "./users.repository.js";

// 16 URL-safe characters from the operating system's secure random generator
function temporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}

// The temporary password is returned ONCE and never stored in readable form
export const usersService = {
  async createStaffLogin(
    ctx: RequestContext,
    input: { staff_id: number; username: string; role: "admin" | "staff" },
  ) {
    const temporary = temporaryPassword();
    const user = await usersRepository.createStaffLogin(ctx, {
      ...input,
      hash: await bcrypt.hash(temporary, 12),
    });
    return { ...user, temporary_password: temporary };
  },

  async resetPassword(ctx: RequestContext, userId: number) {
    const temporary = temporaryPassword();
    const user = await usersRepository.resetPassword(ctx, userId, await bcrypt.hash(temporary, 12));
    return { ...user, temporary_password: temporary };
  },
};
