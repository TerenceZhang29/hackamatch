import { Button, Heading, Section, Text } from "@react-email/components";
import { Layout, styles } from "./Layout";

export interface InboundInterestProps {
  /** "interest": the other person tapped Interested; "intro": we suggest the pair. */
  variant: "interest" | "intro";
  otherName: string;
  /** The other person's one-line summary, or the pitch of the idea in question. */
  otherSummary: string | null;
  /** Shown when the interest is about the recipient's own idea. */
  ideaPitch: string | null;
  reason: string | null;
  interestedUrl: string;
  passUrl: string;
  pauseUrl: string;
}

export function inboundInterestSubject(props: Pick<InboundInterestProps, "variant" | "otherName">) {
  return props.variant === "intro"
    ? `We think you should meet ${props.otherName}`
    : `${props.otherName} is interested in building with you`;
}

export function InboundInterest(props: InboundInterestProps) {
  const heading =
    props.variant === "intro"
      ? `Meet ${props.otherName}`
      : props.ideaPitch
        ? `${props.otherName} is interested in your idea`
        : `${props.otherName} wants to build with you`;
  return (
    <Layout preview={heading} pauseUrl={props.pauseUrl}>
      <Heading as="h1" style={styles.heading}>
        {heading}
      </Heading>
      {props.ideaPitch ? <Text style={styles.muted}>Your idea: {props.ideaPitch}</Text> : null}
      <Section style={styles.card}>
        <Text style={{ ...styles.text, fontWeight: 600 }}>{props.otherName}</Text>
        {props.otherSummary ? <Text style={styles.text}>{props.otherSummary}</Text> : null}
        {props.reason ? <Text style={styles.muted}>Why: {props.reason}</Text> : null}
      </Section>
      <Text style={styles.text}>
        If you&apos;re both interested, we&apos;ll share contact details and suggest a 15-minute
        coffee.
      </Text>
      <Section>
        <Button href={props.interestedUrl} style={styles.primaryButton}>
          I&apos;m interested
        </Button>{" "}
        <Button href={props.passUrl} style={styles.secondaryButton}>
          Pass
        </Button>
      </Section>
    </Layout>
  );
}
