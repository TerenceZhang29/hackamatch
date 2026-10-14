/** Shows a slug the way people write it: `ux-design` → `ux design`. */
export function tagLabel(slug: string): string {
  return slug.replaceAll("-", " ");
}
