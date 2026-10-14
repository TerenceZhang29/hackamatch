import { tagLabel } from "@/lib/taxonomy/labels";

const SCOPE_LABELS = {
  weekend: "Weekend build",
  few_weeks: "A few weeks",
  ongoing: "Ongoing",
} as const;

export function scopeLabel(scope: keyof typeof SCOPE_LABELS | null): string | null {
  return scope ? SCOPE_LABELS[scope] : null;
}

/** Domain, scope and the skills an idea needs, as small read-only chips. */
export function IdeaTags({
  domain,
  scope,
  skillsNeeded,
}: {
  domain: string | null;
  scope: keyof typeof SCOPE_LABELS | null;
  skillsNeeded: string[];
}) {
  const meta = [domain ? tagLabel(domain) : null, scopeLabel(scope)].filter(Boolean);
  return (
    <div className="flex flex-col gap-2">
      {meta.length ? <p className="text-sm text-neutral-500">{meta.join(" · ")}</p> : null}
      {skillsNeeded.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Skills needed">
          {skillsNeeded.map((skill) => (
            <li
              key={skill}
              className="rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800"
            >
              {tagLabel(skill)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
