import { prisma } from "@/lib/prisma-client";
import { routeError } from "./utils";
import type { AuthRepository } from "./types";

/**
 * Data access for authentication-adjacent lookups.
 *
 * Credential verification lives in `src/auth.ts` (NextAuth) and is not exposed
 * here — this repository is intentionally read-only so there is no second,
 * rate-limit-free path to validate a password.
 */
export class PostgresAuthRepository implements AuthRepository {
  /** Resolve login username to email */
  async resolveLoginEmail(username: string): Promise<string> {
    const user = await prisma.users.findUnique({
      where: { username: username.toLowerCase() },
      select: { email: true },
    });

    if (!user) {
      throw routeError(404, "Usuário não encontrado");
    }

    return user.email;
  }
}
