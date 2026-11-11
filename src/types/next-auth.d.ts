import { DefaultSession } from "next-auth";

type Role = "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      // Uniquement pertinent pour STUDENT — simple libellé d'affichage
      // ("Pilote" plutôt que "Élève"), voir StudentProfile.isPilot et
      // src/lib/permissions.ts. Toujours false/absent pour les autres rôles.
      isPilot?: boolean;
    } & DefaultSession["user"];
    // Présent seulement pendant un aperçu "Voir en tant que" du Gérant :
    // user ci-dessus est alors le compte affiché, pas le Gérant lui-même —
    // voir src/lib/auth.ts.
    preview?: {
      realName: string;
      until: number;
    };
  }

  interface User {
    role: Role;
    isPilot?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    isPilot?: boolean;
    preview?: {
      realUserId: string;
      realRole: Role;
      realName: string;
      realEmail?: string | null;
      realIsPilot?: boolean;
      until: number;
    };
  }
}
