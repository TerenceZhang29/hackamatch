/**
 * "Maya Patel" → "Maya P."; a single name stays as is; no name → a generic
 * label. Mirrors the SQL function `public.display_name`, used where the app
 * builds a public name itself.
 */
export function displayName(name: string | null | undefined): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return "Cornell student";
  if (words.length === 1) return words[0]!;
  return `${words[0]} ${words.at(-1)!.charAt(0).toUpperCase()}.`;
}
