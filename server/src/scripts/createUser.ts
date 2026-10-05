import bcrypt from "bcryptjs";
import { clients } from "../db/prismaClients.js";

// Usage (run from /server):
//   npm run create-user -- --username admin1 --password "<password>" --role admin --staff-id 1
//   npm run create-user -- --username resident1 --password "<password>" --role resident --resident-id 1
// Creates a login account with a bcrypt-hashed password, as admin_role.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const username = arg("username");
  const password = arg("password");
  const role = arg("role");
  const staffId = arg("staff-id");
  const residentId = arg("resident-id");

  if (!username || !password || !role || !["admin", "staff", "resident"].includes(role)) {
    throw new Error("Required: --username, --password, --role (admin|staff|resident)");
  }
  if (password.length < 12) throw new Error("Password must be at least 12 characters");
  if (role === "resident" ? !residentId : !staffId) {
    throw new Error(role === "resident" ? "Residents need --resident-id" : "Admin/staff need --staff-id");
  }

  const user = await clients.admin.users.create({
    data: {
      username,
      password_hash: await bcrypt.hash(password, 12),
      role,
      staff_id: role === "resident" ? null : Number(staffId),
      resident_id: role === "resident" ? Number(residentId) : null,
    },
  });

  console.log(`Created user #${user.user_id} (${user.username}, ${user.role})`);
}

main()
  .catch((err) => {
    console.error("Failed:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => clients.admin.$disconnect());
