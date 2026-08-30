import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Identifiants",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { studentProfile: { select: { isPilot: true } } },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          isPilot: user.studentProfile?.isPilot ?? false,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id as string;
        token.isPilot = (user as { isPilot?: boolean }).isPilot ?? false;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { isPilot?: boolean }).isPilot = token.isPilot as boolean;
      }
      return session;
    },
  },
});
