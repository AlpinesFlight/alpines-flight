// Petit wrapper fetch côté client pour les appels API JSON.
export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error
      ? typeof data.error === "string"
        ? data.error
        : JSON.stringify(data.error)
      : `Erreur ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}
