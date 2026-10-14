/** A URL slug from a name: "Cornell Tech Fall Hack!" → "cornell-tech-fall-hack". */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replaceAll(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, 60)
      .replaceAll(/-+$/g, "") || "event"
  );
}
