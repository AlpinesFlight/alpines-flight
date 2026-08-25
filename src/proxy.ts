import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Pages publiques, consultables sans connexion — au-delà de /login
// lui-même, les pages légales doivent rester accessibles à quiconque (RGPD :
// l'information des personnes concernées ne peut pas être conditionnée à la
// création d'un compte).
const PUBLIC_PATHS = new Set(["/login", "/confidentialite", "/mentions-legales"]);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const pathname = req.nextUrl.pathname;
  const isPublicPage = PUBLIC_PATHS.has(pathname);

  if (!isLoggedIn && !isPublicPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  // Exclut les routes d'auth, les assets Next et tout fichier statique
  // (n'importe quel chemin contenant une extension, ex: /brand/logo.png)
  matcher: ["/((?!api/auth|_next/static|_next/image|.*\\..*).*)"],
};
