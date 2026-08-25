import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";
    } & DefaultSession["user"];
  }

  interface User {
    role: "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "GERANT" | "ADMIN" | "INSTRUCTOR" | "STUDENT";
  }
}
