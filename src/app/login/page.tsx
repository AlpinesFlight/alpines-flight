"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }

    router.push("/");
    router.refresh();
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
            Alpines Flight
          </h1>
          <p className="text-navy-100 text-sm mt-1">École de pilotage / Location d&apos;avion</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-cream-50 rounded-2xl shadow-xl p-6 flex flex-col gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-sunset-500"
              placeholder="prenom.nom@alpinesflight.fr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-navy-100 px-3 py-2 text-navy-900 focus:outline-none focus:ring-2 focus:ring-sunset-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-sunset-500 hover:bg-sunset-600 text-white font-semibold py-2.5 transition-colors disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="text-center text-navy-100 text-xs mt-6">
          Version 1.0
        </p>
        <p className="text-center text-navy-100 text-xs mt-3 flex items-center justify-center gap-3">
          <a href="/confidentialite" className="hover:text-cream-50 hover:underline">
            Confidentialité
          </a>
          <span>·</span>
          <a href="/mentions-legales" className="hover:text-cream-50 hover:underline">
            Mentions légales
          </a>
        </p>
      </div>
    </div>
  );
}
