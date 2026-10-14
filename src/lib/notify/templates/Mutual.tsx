import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { Layout, styles } from "./Layout";

export interface MutualProps {
  other: {
    name: string;
    email: string;
    summary: string | null;
    githubUrl: string | null;
    linkedinUrl: string | null;
  };
  ideaPitch: string | null;
  coffeeChat: string;
  matchUrl: string;
  pauseUrl: string;
}

export function mutualSubject(props: Pick<MutualProps, "other">) {
  return `It's a match: you and ${props.other.name}`;
}

export function Mutual(props: MutualProps) {
  const { other } = props;
  return (
    <Layout preview={`You and ${other.name} are both interested`} pauseUrl={props.pauseUrl}>
      <Heading as="h1" style={styles.heading}>
        You and {other.name} are both interested
      </Heading>
      {props.ideaPitch ? <Text style={styles.muted}>The idea: {props.ideaPitch}</Text> : null}
      <Section style={styles.card}>
        <Text style={{ ...styles.text, fontWeight: 600 }}>{other.name}</Text>
        {other.summary ? <Text style={styles.text}>{other.summary}</Text> : null}
        <Text style={styles.text}>
          <Link href={`mailto:${other.email}`}>{other.email}</Link>
        </Text>
        {other.githubUrl ? (
          <Text style={styles.muted}>
            GitHub: <Link href={other.githubUrl}>{other.githubUrl}</Link>
          </Text>
        ) : null}
        {other.linkedinUrl ? (
          <Text style={styles.muted}>
            LinkedIn: <Link href={other.linkedinUrl}>{other.linkedinUrl}</Link>
          </Text>
        ) : null}
      </Section>
      <Text style={styles.text}>A message you could send:</Text>
      <Text style={styles.quote}>{props.coffeeChat}</Text>
      <Section>
        <Button href={props.matchUrl} style={styles.primaryButton}>
          Pick hackathons together
        </Button>
      </Section>
      <Text style={styles.muted}>
        Matches never expire, and you both stay in the pool to keep matching.
      </Text>
    </Layout>
  );
}
