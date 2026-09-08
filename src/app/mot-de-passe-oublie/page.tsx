"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Réponse toujours générique côté serveur (voir la route) — ne
      // révèle jamais si l'email existe ou non.
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-800 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/brand/logo-mark.png"
            alt="Alpines Flight"
            width={104}
            height={104}
            priority
            className="rounded-full shadow-lg"
          />
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold text-cream-50 tracking-tight">
            Mot de passe oublié
          </h1>
          <p className="text-navy-100 text-sm mt-1 text-center">
            Indique ton email, on t&apos;envoie un lien pour en choisir un nouveau.
          </p>
        </div>

        <div className="bg-cream-50 rounded-2xl shadow-xl p-6 flex flex-col gap-4">
          {sent ? (
            <p className="text-sm text-navy-800 bg-navy-100 rounded-lg px-3 py-3">
              Si un compte existe avec cet email, un lien de réinitialisation vient d&apos;être envoyé.
              Vérifie ta boîte mail (et les indésirables) — le lien est valable 1 heure.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-navy-100 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-sunset-500"
                  placeholder="prenom.nom@alpinesflight.fr"
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold py-2.5 transition-colors disabled:opacity-60"
              >
                {loading ? "Envoi..." : "Envoyer le lien"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-navy-100 text-sm mt-6">
          <Link href="/login" className="hover:text-cream-50 hover:underline">
            ← Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
