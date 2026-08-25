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
          <li>Siège social : <ToFill>adresse complète</ToFill></li>
          <li>Numéro DTO (agrément DSAC) : <ToFill>référence de la déclaration</ToFill></li>
          <li>Directeur de la publication : <ToFill>nom du responsable</ToFill></li>
          <li>Contact : <ToFill>email ou téléphone</ToFill></li>
        </ul>
      </Section>

      <Section title="Hébergement">
        <ul className="flex flex-col gap-1">
          <li>Hébergeur : <ToFill>nom de l&apos;hébergeur (ex. OVH)</ToFill></li>
          <li>Adresse : <ToFill>adresse de l&apos;hébergeur</ToFill></li>
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
