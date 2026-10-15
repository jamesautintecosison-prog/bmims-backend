import bcrypt from "bcryptjs";
import type { RequestContext } from "../../db/withRequestContext.js";
import { HttpError } from "../../utils/httpError.js";
import { authRepository } from "../auth/auth.repository.js";
import { accountRepository } from "./account.repository.js";

export const accountService = {
  async changePassword(
    ctx: RequestContext,
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await authRepository.findUserById(userId);
    const matches = user ? await bcrypt.compare(currentPassword, user.password_hash) : false;

    // 400, not 401: a 401 would sign the person out of the web app
    if (!matches) throw new HttpError(400, "Current password is incorrect");
    if (currentPassword === newPassword) {
      throw new HttpError(400, "The new password must be different from the current one");
    }

    await accountRepository.setOwnPassword(ctx, await bcrypt.hash(newPassword, 12));
  },
};
