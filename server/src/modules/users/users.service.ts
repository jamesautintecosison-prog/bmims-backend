import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { RequestContext } from "../../db/withRequestContext.js";
import { usersRepository } from "./users.repository.js";

// 16 URL-safe characters from the operating system's secure random generator
function temporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}

// first.last in lowercase letters and digits; a number is added if it is taken
function pickUsername(first: string, last: string, taken: Set<string>): string {
  let base = `${first}.${last}`.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 40);
  if (base.length < 3) base = "resident";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}${n++}`;
  return candidate;
}

const MAX_PER_CALL = 50;

// Temporary passwords are returned ONCE and never stored in readable form
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

  // Gives every active resident without a login their own account.
  // Pass resident ids to do just those; otherwise up to 50 are done per call.
  async provisionResidents(ctx: RequestContext, residentIds?: number[]) {
    const { residents, usernames } = await usersRepository.findResidentsWithoutAccount(ctx, residentIds);
    const batch = residents.slice(0, MAX_PER_CALL);
    const taken = new Set(usernames);

    const prepared = [];
    for (const resident of batch) {
      const username = pickUsername(resident.first_name, resident.last_name, taken);
      taken.add(username);
      const temporary = temporaryPassword();
      prepared.push({
        resident_id: resident.resident_id,
        name: `${resident.first_name} ${resident.last_name}`,
        username,
        temporary_password: temporary,
        // random 16-character passwords are strong, so a lighter hash cost is fine here
        password_hash: await bcrypt.hash(temporary, 10),
      });
    }

    if (prepared.length > 0) {
      await usersRepository.createResidentLogins(
        ctx,
        prepared.map((p) => ({
          resident_id: p.resident_id,
          username: p.username,
          password_hash: p.password_hash,
          role: "resident" as const,
        })),
      );
    }

    return {
      created: prepared.map((p) => ({
        resident_id: p.resident_id,
        name: p.name,
        username: p.username,
        temporary_password: p.temporary_password,
      })),
      remaining: residents.length - batch.length,
    };
  },
};
