import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Aperçu "Voir en tant que" : le Gérant affiche l'appli exactement comme un
// autre compte (élève, pilote, instructeur, administrateur) pour en vérifier
// les écrans. Le jeton porte alors l'identité du compte affiché (id, rôle,
// nom) — tout le code existant (auth(), useSession()) le voit donc sans
// changement — et garde l'identité réelle dans token.preview pour revenir.
// Toujours en lecture seule : src/proxy.ts refuse toute écriture pendant un
// aperçu (aucun enregistrement, aucun e-mail au nom de quelqu'un d'autre),
// repéré grâce au cookie PREVIEW_COOKIE posé par /api/preview. Fin
// automatique au bout de PREVIEW_DURATION_MS.
export const PREVIEW_DURATION_MS = 3 * 60 * 60 * 1000;
export const PREVIEW_COOKIE = "af-apercu";
const PREVIEWABLE_ROLES = ["STUDENT", "INSTRUCTOR", "ADMIN"] as const;

const userIdentitySelect = {
  id: true,
  role: true,
  firstName: true,
  lastName: true,
  email: true,
  studentProfile: { select: { isPilot: true } },
} as const;

// Seule porte d'entrée de l'aperçu, quel que soit l'appelant (/api/preview ou
// une mise à jour de session envoyée directement par un navigateur) : le
// compte réel doit être Gérant EN BASE au moment de la demande, et le compte
// affiché ni lui-même ni un autre Gérant. Sinon le jeton reste inchangé.
async function startPreview(token: JWT, targetUserId: string): Promise<JWT> {
  const realUserId = token.preview?.realUserId ?? token.id;
  const [real, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: realUserId }, select: userIdentitySelect }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: userIdentitySelect }),
  ]);
  if (
    !real ||
    real.role !== "GERANT" ||
    !target ||
    target.id === real.id ||
    !(PREVIEWABLE_ROLES as readonly string[]).includes(target.role)
  ) {
    return token;
  }
  return {
    ...token,
    id: target.id,
    role: target.role,
    isPilot: target.studentProfile?.isPilot ?? false,
    name: `${target.firstName} ${target.lastName}`,
    email: target.email,
    preview: {
      realUserId: real.id,
      realRole: real.role,
      realName: `${real.firstName} ${real.lastName}`,
      realEmail: real.email,
      realIsPilot: real.studentProfile?.isPilot ?? false,
      until: Date.now() + PREVIEW_DURATION_MS,
    },
  };
}

function endPreview(token: JWT): JWT {
  if (!token.preview) return token;
  const { preview, ...rest } = token;
  return {
    ...rest,
    id: preview.realUserId,
    role: preview.realRole,
    isPilot: preview.realIsPilot ?? false,
    name: preview.realName,
    email: preview.realEmail ?? rest.email,
  };
}

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
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
    jwt: async ({ token, user, trigger, session }) => {
      if (user) {
        token.role = (user as { role: JWT["role"] }).role;
        token.id = user.id as string;
        token.isPilot = (user as { isPilot?: boolean }).isPilot ?? false;
      }
      if (trigger === "update" && session && typeof session === "object") {
        const request = session as { previewUserId?: unknown; previewStop?: unknown };
        if (request.previewStop === true) return endPreview(token);
        if (typeof request.previewUserId === "string") return startPreview(token, request.previewUserId);
      }
      // Appelé à chaque lecture de session : un aperçu oublié se termine seul.
      if (token.preview && token.preview.until < Date.now()) return endPreview(token);
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { isPilot?: boolean }).isPilot = token.isPilot as boolean;
      }
      if (token.preview) {
        session.preview = { realName: token.preview.realName, until: token.preview.until };
      }
      return session;
    },
  },
});
