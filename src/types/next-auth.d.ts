import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";
      // Uniquement pertinent pour STUDENT — simple libellé d'affichage
      // ("Pilote" plutôt que "Élève"), voir StudentProfile.isPilot et
      // src/lib/permissions.ts. Toujours false/absent pour les autres rôles.
      isPilot?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";
    isPilot?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";
    isPilot?: boolean;
  }
}
