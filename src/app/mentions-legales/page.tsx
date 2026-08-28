import { LegalLayout, Section, ToFill } from "@/components/LegalLayout";

export const metadata = { title: "Mentions légales — Alpines Flight" };

export default function MentionsLegalesPage() {
  return (
    <LegalLayout title="Mentions légales" subtitle="Éditeur, hébergement et propriété intellectuelle">
      <Section title="Éditeur du site">
        <ul className="flex flex-col gap-1">
          <li>Raison sociale : <ToFill>nom de la structure</ToFill></li>
          <li>Forme juridique : <ToFill>ex. association loi 1901, SAS, auto-entreprise...</ToFill></li>
          <li>SIRET : <ToFill>numéro SIRET</ToFill></li>
          <li>Siège social : 2 impasse de l&apos;Aéropostale, 05130 Tallard</li>
          <li>Numéro DTO (agrément DSAC) : <ToFill>référence de la déclaration</ToFill></li>
          <li>Directeur de la publication : <ToFill>nom du responsable (par défaut : le compte Gérant)</ToFill></li>
          <li>Contact : contact@alpinesflight.com · +33 (0)6 51 40 71 08</li>
        </ul>
      </Section>

      <Section title="Hébergement">
        <p className="text-navy-600 text-xs mb-1">
          Coordonnées complètes des hébergeurs disponibles sur leurs propres pages légales,
          plus fiables et à jour qu&apos;une adresse recopiée ici.
        </p>
        <ul className="flex flex-col gap-1">
          <li>
            Application (dtoalpinesflight.com) : Vercel Inc. —{" "}
            <a href="https://vercel.com/legal" target="_blank" rel="noopener noreferrer" className="text-sunset-600 hover:underline">
              vercel.com/legal
            </a>
          </li>
          <li>
            Base de données : Neon (via Vercel), infrastructure AWS région Europe — Francfort,
            Allemagne
          </li>
          <li>
            Nom de domaine : OVH SAS, 2 rue Kellermann, 59100 Roubaix, France —{" "}
            <a href="https://www.ovhcloud.com/fr/personal-data-protection/" target="_blank" rel="noopener noreferrer" className="text-sunset-600 hover:underline">
              ovhcloud.com
            </a>
          </li>
        </ul>
      </Section>

      <Section title="Propriété intellectuelle">
        <p>
          L&apos;ensemble des contenus de cette application (textes, logo, mise en page) est la
          propriété de l&apos;éditeur mentionné ci-dessus, sauf mention contraire. Toute
          reproduction sans autorisation est interdite.
        </p>
      </Section>

      <Section title="Données personnelles">
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <a href="/confidentialite" className="text-sunset-600 hover:underline">
            politique de confidentialité
          </a>
          .
        </p>
      </Section>

      <p className="text-navy-400 text-xs pt-2 border-t border-navy-100">
        Modèle à valider et compléter par l&apos;école — ne constitue pas un avis juridique certifié.
      </p>
    </LegalLayout>
  );
}
