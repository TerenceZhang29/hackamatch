import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy · HackaMatch" };

/**
 * The privacy policy (docs/plans/ios-app.md, phase 2), also the App Store
 * listing's privacy policy URL. Keep it true: when the app starts collecting
 * something new or using a new provider, change this page in the same commit.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" effective="November 11, 2026">
      <LegalSection title="What we collect">
        <ul>
          <li>
            <strong>Your account:</strong> your school email address and your name.
          </li>
          <li>
            <strong>Your profile:</strong> the hackathons, areas and skills you pick, and any
            profile links or text you add.
          </li>
          <li>
            <strong>What you do:</strong> who you say Interested or Pass to, your matches, the
            hackathons you pick together, your teams, and people you block or report.
          </li>
          <li>
            <strong>Usage:</strong> a log of actions in the app, such as signing in or opening
            Discover, and the emails we send you. We use it to see what works and to stop abuse.
          </li>
        </ul>
        <p>
          We don&apos;t collect your location, contacts or photos, we don&apos;t show ads, and we
          don&apos;t track you across other apps or sites.
        </p>
      </LegalSection>

      <LegalSection title="Who sees what">
        <ul>
          <li>
            <strong>Other members</strong> see your first name and last initial, your areas and
            skills, and the hackathons you&apos;re going to.
          </li>
          <li>
            <strong>Someone you match with</strong>, once you are both interested, also sees your
            full name and email address.
          </li>
          <li>
            <strong>Nobody</strong> sees who you passed on, or that you blocked or reported them.
          </li>
          <li>
            <strong>The people who run HackaMatch</strong> can see account details to run the
            service and to review reports.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Companies that process it for us">
        <p>We never sell your information. These companies handle it only to run HackaMatch:</p>
        <ul>
          <li>Supabase stores the database and handles sign-in.</li>
          <li>Vercel hosts the website and the app&apos;s server.</li>
          <li>Resend delivers our emails.</li>
          <li>
            Voyage AI turns your areas and skills into numbers we use to suggest people. It
            doesn&apos;t receive your name or email.
          </li>
          <li>
            Anthropic drafts the first message we suggest when you match, from both first names and
            profile summaries.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Keeping and deleting">
        <p>
          We keep your information while you have an account. You can delete your account at any
          time from your profile: that removes your profile, matches and teams straight away. Usage
          logs are kept without your identity, and copies in backups go as the backups expire.
        </p>
        <p>
          You can pause matching, or stop our emails, from your profile or from the link at the
          bottom of any email.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and questions">
        <p>
          To see, correct or delete your information, or to ask anything about this policy, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If we change this policy, we will
          post the new version here with its date.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
