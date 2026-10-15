import { authClient } from "../../db/prismaClients.js";

// Repository layer for login: the only code that reads the users table
// before a caller is authenticated, and it does so as the SELECT-only auth_role.
export const authRepository = {
  findUserByUsername(username: string) {
    return authClient.users.findUnique({ where: { username } });
  },

  // Used to check the current password when someone changes their own
  findUserById(userId: number) {
    return authClient.users.findUnique({ where: { user_id: userId } });
  },
};
