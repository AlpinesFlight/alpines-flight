import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Alpines Flight — Planning",
  description: "École de pilotage / Location d'avion — gestion du planning, des élèves, de la flotte et de la facturation.",
  appleWebApp: {
    title: "Alpines Flight",
    statusBarStyle: "black-translucent",
  },
  other: {
    // Version d'iOS antérieure à 17.4 : seule cette balise (préfixée
    // "apple-") active le mode plein écran sans barre Safari ; Next
    // n'émet que la balise standard "mobile-web-app-capable" via
    // appleWebApp ci-dessus, donc on ajoute l'ancienne à la main.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c2448",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${poppins.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
