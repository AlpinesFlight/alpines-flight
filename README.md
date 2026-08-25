# Alpines Flight — Application de planning

Application de gestion pour école de pilotage : planning des réservations
(avions + instructeurs), gestion des élèves, suivi de la flotte et de la
maintenance, facturation.

## Stack technique

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4** — thème aux couleurs de la charte Alpines Flight
- **Prisma 6 + SQLite** (base locale `prisma/dev.db`) — migration facile vers
  Postgres/Supabase pour la mise en ligne
- **NextAuth v5** (comptes + rôles ADMIN / INSTRUCTOR / STUDENT)
- **react-big-calendar** pour le planning

## Démarrage

```bash
cd alpines-flight
npm install
npm run seed   # (re)génère des données de démonstration
npm run dev
```

Ouvrir http://localhost:3000

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Admin | admin@alpinesflight.fr | admin1234 |
| Instructeur | julien.blanc@alpinesflight.fr | instruct1234 |
| Instructeur | sophie.martin@alpinesflight.fr | instruct1234 |
| Élève | lucas.perrin@example.com | eleve1234 |
| Élève | emma.girard@example.com | eleve1234 |

## Fonctionnalités V1

- **Planning** : calendrier semaine/mois/jour/agenda, création par
  clic-glisser, filtres par avion/instructeur, détection automatique des
  conflits de réservation (avion ou instructeur déjà pris sur le créneau).
- **Élèves** : fiche élève (licence, heures totales, solde de compte),
  historique des réservations et factures, création de nouveau compte élève.
- **Flotte** : fiche par avion (tarif horaire, heures cellule, statut),
  échéances de maintenance (horaires ou calendaires) avec badges
  À venir / À prévoir / Dépassé.
- **Facturation** : création de facture à lignes libres, calcul du total,
  enregistrement des encaissements (carte, virement, espèces, chèque) qui
  mettent à jour le solde du compte élève.

## Prochaines étapes possibles

1. **Logo réel** : le badge utilisé dans l'app (`public/logo-mark.svg`) est
   une recréation fidèle aux couleurs du logo fourni. Pour utiliser le fichier
   PNG original, le déposer dans `public/logo.png` — je peux ensuite le
   substituer dans la sidebar et l'écran de connexion.
2. **Mise en ligne multi-utilisateurs** : passage de SQLite à Postgres
   (ex: Supabase, qui fournit aussi l'authentification et l'hébergement),
   puis déploiement (ex: Vercel). Nécessite la création de comptes par
   l'utilisateur.
3. **Espace élève en libre-service** : permettre aux élèves de réserver
   eux-mêmes leurs créneaux (actuellement, la création de réservation est
   ouverte à tout utilisateur connecté — à restreindre par rôle si besoin).
4. **Carnet de vol détaillé** : saisie Hobbs/tacho à la clôture d'un vol,
   génération automatique de facture depuis un vol effectué.
5. **Notifications** : alertes email/SMS avant échéance de maintenance ou
   visite médicale.

## Structure du projet

```
prisma/schema.prisma   Modèle de données complet
prisma/seed.ts         Données de démonstration
src/app/(app)/         Pages protégées (dashboard, planning, élèves, flotte, facturation)
src/app/api/           Routes API (CRUD)
src/components/        Composants UI (calendrier, modales, vues)
src/lib/                Prisma client, auth, formatage
```
