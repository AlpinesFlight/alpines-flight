import { LegalLayout, Section, ToFill } from "@/components/LegalLayout";

export const metadata = { title: "Confidentialité — Alpines Flight" };

export default function ConfidentialitePage() {
  return (
    <LegalLayout
      title="Politique de confidentialité"
      subtitle="Comment Alpines Flight traite les données personnelles de cette application"
    >
      <p className="text-navy-500 text-xs">Dernière mise à jour : 25 août 2026.</p>

      <Section title="1. Qui est responsable de vos données">
        <p>
          Le responsable du traitement est l&apos;organisme de formation déclaré (DTO)
          exploitant Alpines Flight — <ToFill>raison sociale, forme juridique et SIRET</ToFill>,
          voir la page <a href="/mentions-legales" className="text-sunset-600 hover:underline">Mentions légales</a>.
        </p>
      </Section>

      <Section title="2. Quelles données sont traitées, et pourquoi">
        <p>Cette application gère uniquement les comptes du personnel et des élèves/pilotes de l&apos;école. Selon votre profil :</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Identité et contact</strong> (nom, email, téléphone) — pour créer et gérer
            votre compte. Base légale : exécution du contrat qui vous lie à l&apos;école.
          </li>
          <li>
            <strong>Vols et réservations</strong> (planning, carnet de vol, heures, terrains) —
            pour organiser les vols et tenir le carnet de vol de l&apos;école. Base légale :
            exécution du contrat et obligation légale (traçabilité de l&apos;activité de
            formation, exigée par la réglementation DSAC applicable aux DTO).
          </li>
          <li>
            <strong>Licences, qualifications et certificats médicaux</strong> (dates
            d&apos;échéance, numéros, scans des documents) — pour vérifier que vous êtes
            autorisé·e à voler et vous relancer avant expiration. Base légale : obligation
            légale (sécurité aérienne) et intérêt légitime de l&apos;école.
          </li>
          <li>
            <strong>Compte pilote</strong> (versements, débits de vol, solde) — pour la
            facturation. Base légale : exécution du contrat et obligation légale (comptabilité).
          </li>
          <li>
            <strong>Vols découverte/baptême</strong> — pour un client de passage sans compte,
            uniquement son nom et, si transmis, téléphone/email, le temps d&apos;organiser le vol.
          </li>
        </ul>
        <p>
          L&apos;application ne collecte aucune donnée au-delà de ce qui est nécessaire à ces
          finalités (minimisation des données) : par exemple, un compte élève ne peut consulter
          ni le solde ni les données médicales d&apos;un autre élève, un compte Admin n&apos;a
          aucun accès aux finances, et le contenu des documents (scans, pièces jointes) n&apos;est
          jamais renvoyé dans une simple liste — seule une page dédiée, avec vérification des
          droits, le sert.
        </p>
      </Section>

      <Section title="3. Qui a accès à vos données">
        <p>L&apos;application distingue quatre niveaux d&apos;accès, du plus restreint au plus large :</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>Élève / pilote</strong> : ses propres données uniquement.</li>
          <li><strong>FI (instructeur)</strong> : le suivi pédagogique de tous les élèves (licences, progression), jamais les finances.</li>
          <li><strong>Admin</strong> : la gestion courante de l&apos;école (élèves, flotte, formation), jamais les finances.</li>
          <li><strong>Gérant</strong> : accès complet, y compris les finances — un seul compte en principe.</li>
        </ul>
        <p>Le détail de ces règles est documenté dans le code de l&apos;application (fichier <code className="bg-navy-50 px-1 rounded">src/lib/permissions.ts</code>) et appliqué à chaque page comme à chaque requête.</p>
      </Section>

      <Section title="4. Durée de conservation">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Données comptables</strong> (versements, débits, solde) : 10 ans, conformément
            à l&apos;obligation légale de conservation des pièces comptables (Code de commerce).
          </li>
          <li>
            <strong>Carnet de vol et dossiers de formation</strong> : conservés pendant la durée
            exigée par la réglementation applicable aux DTO — <ToFill>durée exacte à confirmer
            auprès de la DSAC/de l&apos;autorité de tutelle</ToFill>.
          </li>
          <li>
            <strong>Licences/qualifications</strong> : le document courant tant qu&apos;il est
            valide ; les versions remplacées sont archivées pour l&apos;historique.
          </li>
          <li>
            <strong>Compte inactif</strong> (élève/pilote n&apos;ayant plus d&apos;activité) :{" "}
            <ToFill>durée avant anonymisation automatique à décider par l&apos;école</ToFill> — en
            attendant, l&apos;anonymisation peut être faite manuellement par le Gérant à tout moment
            (voir section 5).
          </li>
        </ul>
      </Section>

      <Section title="5. Vos droits">
        <p>Conformément au RGPD, vous disposez des droits suivants sur vos données :</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Droit d&apos;accès et de portabilité</strong> : depuis l&apos;application,
            le lien « Exporter mes données » (en bas de la barre latérale) télécharge
            immédiatement toutes vos données en un fichier.
          </li>
          <li>
            <strong>Droit de rectification</strong> : la plupart de vos informations sont
            modifiables depuis votre profil ou en le demandant au Gérant.
          </li>
          <li>
            <strong>Droit à l&apos;effacement</strong> : sur demande auprès du Gérant, votre
            identité est anonymisée (nom, email, téléphone remplacés, connexion définitivement
            désactivée, scans de licence/médicale supprimés). Les écritures comptables et
            heures de vol restent conservées, rattachées à un compte anonyme, le temps légal
            requis — elles ne peuvent pas être effacées avant ce délai (obligation légale
            prioritaire sur le droit à l&apos;effacement, RGPD art. 17§3).
          </li>
          <li>
            <strong>Droit d&apos;opposition et de limitation</strong> : à exercer auprès du Gérant.
          </li>
        </ul>
        <p>
          Contact pour exercer ces droits : <ToFill>adresse email ou postale dédiée</ToFill>. Vous
          pouvez aussi introduire une réclamation auprès de la CNIL (
          <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-sunset-600 hover:underline">
            cnil.fr
          </a>
          ).
        </p>
      </Section>

      <Section title="6. Cookies">
        <p>
          L&apos;application dépose un seul cookie, strictement nécessaire pour vous garder
          connecté·e (cookie de session). Aucun cookie publicitaire, de mesure d&apos;audience
          ou de traçage n&apos;est utilisé — aucun bandeau de consentement n&apos;est donc requis
          (exemption prévue pour les cookies strictement nécessaires).
        </p>
      </Section>

      <Section title="7. Hébergement et sous-traitants">
        <p>
          Les données sont hébergées par <ToFill>nom et localisation de l&apos;hébergeur</ToFill>.{" "}
          <ToFill>Ajouter ici tout autre sous-traitant traitant des données (envoi d&apos;emails, etc.), le cas échéant</ToFill>.
        </p>
      </Section>

      <Section title="8. Sécurité">
        <p>
          Les mots de passe ne sont jamais stockés en clair (hachage). Les fichiers sensibles
          (scans de documents, pièces jointes) ne transitent jamais par une simple liste : ils
          sont servis un par un, après vérification des droits d&apos;accès. Les échanges avec
          l&apos;application doivent être chiffrés (HTTPS) une fois en production.
        </p>
      </Section>

      <p className="text-navy-400 text-xs pt-2 border-t border-navy-100">
        Cette page a été rédigée pour refléter fidèlement le fonctionnement réel de
        l&apos;application. Elle ne constitue pas un avis juridique certifié — les champs
        marqués « à compléter » doivent être renseignés par l&apos;école, et il est recommandé
        de la faire relire par un professionnel du droit avant publication définitive.
      </p>
    </LegalLayout>
  );
}
