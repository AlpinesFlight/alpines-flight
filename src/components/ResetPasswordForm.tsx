"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
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
            Nouveau mot de passe
          </h1>
        </div>

        <div className="bg-cream-50 rounded-2xl shadow-xl p-6 flex flex-col gap-4">
          {!token ? (
            <p className="text-sm text-navy-800 bg-red-100 text-red-700 rounded-lg px-3 py-3">
              Lien invalide — il manque le jeton de réinitialisation. Redemande un lien depuis la
              page de connexion.
            </p>
          ) : done ? (
            <p className="text-sm text-navy-800 bg-navy-100 rounded-lg px-3 py-3">
              Mot de passe changé. Tu peux te connecter avec ton nouveau mot de passe.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-navy-100 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-sunset-500"
                  placeholder="8 caractères minimum"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-navy-100 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-sunset-500"
                  placeholder="••••••••"
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
                {loading ? "Enregistrement..." : "Changer le mot de passe"}
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
