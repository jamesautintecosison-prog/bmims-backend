import bcrypt from "bcryptjs";
import { clients } from "../db/prismaClients.js";

// Usage (run from /server):
//   npm run reset-password -- --username juan --password "<new password>"
// Replaces a login account's password with a new bcrypt hash, as admin_role.
// The user id stays the same, so the audit history stays linked to the account.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const username = arg("username");
  const password = arg("password");

  if (!username || !password) {
    throw new Error("Required: --username and --password");
  }
  if (password.length < 12) throw new Error("Password must be at least 12 characters");

  const result = await clients.admin.users.updateMany({
    where: { username },
    data: { password_hash: await bcrypt.hash(password, 12) },
  });
  if (result.count === 0) throw new Error(`No user named ${username}`);

  console.log(`Password updated for ${username}`);
}

main()
  .catch((err) => {
    console.error("Failed:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => clients.admin.$disconnect());
