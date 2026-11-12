import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms · HackaMatch" };

/**
 * The terms of use (docs/plans/ios-app.md, phase 2). Joining is agreeing to
 * them: sign-up's last step says so and links here. The App Store requires
 * the "no tolerance" rule and how reports are handled to be stated.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" effective="November 11, 2026">
      <LegalSection title="What HackaMatch is">
        <p>
          HackaMatch helps students find hackathon partners. You say which hackathons, areas and
          skills interest you, and we show you to other members and them to you. When two people are
          both interested, we share each person&apos;s name and email with the other.
        </p>
      </LegalSection>

      <LegalSection title="Who can use it">
        <ul>
          <li>You need an email address at a school we support, and it must be your own.</li>
          <li>You must be at least 18 years old.</li>
          <li>One account per person. Don&apos;t let anyone else use yours.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How to behave">
        <p>
          We have no tolerance for objectionable content or abusive behavior. That means you must
          not:
        </p>
        <ul>
          <li>harass, threaten, bully or demean anyone;</li>
          <li>post anything sexual, hateful, violent or illegal;</li>
          <li>pretend to be someone else, or put false information on your profile;</li>
          <li>send spam or advertising, or use HackaMatch for anything but finding teammates;</li>
          <li>collect other members&apos; details, or use them for anything else;</li>
          <li>try to break, overload or get around the service or its limits.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Reporting and blocking">
        <p>
          You can block or report anyone from their profile or from your match with them. A block
          hides you from each other. We review every report within 24 hours, and we remove content
          and accounts that break these terms.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          Your profile stays yours. You let us store it and show it to other members so the service
          can work. You can change it or delete your account at any time from your profile.
        </p>
      </LegalSection>

      <LegalSection title="What we don't promise">
        <p>
          HackaMatch is provided as it is. We don&apos;t check who members are beyond their email
          address, and we don&apos;t promise you will find a match, a team or a place at any
          hackathon. Hackathons are run by their own organizers, under their own rules. Use your
          judgment when you meet someone, and meet in public places. To the extent the law allows,
          we are not liable for what happens between members or at events.
        </p>
      </LegalSection>

      <LegalSection title="Ending and changes">
        <p>
          You can stop at any time by deleting your account. We may pause or remove an account that
          breaks these terms. If we change the terms, we will post the new version here with its
          date, and tell you by email when the change matters.
        </p>
        <p>
          How we handle your information is in the <Link href="/privacy">privacy policy</Link>.
          Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> about anything here.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
