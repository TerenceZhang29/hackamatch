import { Shell, type ShellViewer } from "@/components/shell/Shell";
import { getUser } from "@/lib/auth";
import { countWaiting } from "@/server/matches";

/** Pages with the app shell: top bar, and tabs for members. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const viewer: ShellViewer = !user ? "anon" : user.onboarded_at ? "onboarded" : "not-onboarded";
  const waiting = viewer === "onboarded" ? await countWaiting(user!.id) : 0;
  return (
    <Shell viewer={viewer} waiting={waiting}>
      {children}
    </Shell>
  );
}
