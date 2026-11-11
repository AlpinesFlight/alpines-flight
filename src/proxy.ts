import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Pages publiques, consultables sans connexion — au-delà de /login
// lui-même, les pages légales doivent rester accessibles à quiconque (RGPD :
// l'information des personnes concernées ne peut pas être conditionnée à la
// création d'un compte).
const PUBLIC_PATHS = new Set([
  "/login",
  "/confidentialite",
  "/mentions-legales",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
]);

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const pathname = req.nextUrl.pathname;

  // Routes API : le proxy n'y passe que pendant un aperçu "Voir en tant que"
  // du Gérant (voir config.matcher et src/lib/auth.ts), uniquement pour le
  // garder en lecture seule — rien ne doit être enregistré ni envoyé au nom
  // du compte affiché. Restent permis : la session elle-même (/api/auth/*)
  // et la sortie de l'aperçu (/api/preview).
  if (pathname.startsWith("/api/")) {
    if (
      req.auth?.preview &&
      !READ_METHODS.has(req.method) &&
      !pathname.startsWith("/api/auth/") &&
      pathname !== "/api/preview"
    ) {
      return NextResponse.json(
        { error: "Aperçu en lecture seule : rien ne peut être enregistré. Reviens à ton compte pour modifier." },
        { status: 403 }
      );
    }
    return;
  }

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
  matcher: [
    // Exclut toutes les routes API (chacune vérifie déjà elle-même la session
    // ou, pour /api/cron/*, un jeton Authorization dédié — un redirect HTML
    // vers /login ici casserait ces appels, qui attendent du JSON ou n'ont
    // justement pas de session de navigateur), les assets Next et tout
    // fichier statique (n'importe quel chemin contenant une extension, ex:
    // /brand/logo.png).
    "/((?!api|_next/static|_next/image|.*\\..*).*)",
    // Routes API seulement pendant un aperçu (cookie posé par /api/preview) :
    // en temps normal, aucun appel API ne paie le passage par le proxy.
    { source: "/api/:path*", has: [{ type: "cookie", key: "af-apercu" }] },
  ],
};
