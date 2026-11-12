import { Button, Heading, Section, Text } from "@react-email/components";
import { Layout, styles } from "./Layout";

export interface ReportProps {
  /** As on their card, "Maya P.": the admin page has the full details. */
  reportedName: string;
  reason: string;
  note: string | null;
  reviewUrl: string;
  pauseUrl: string;
}

export function reportSubject(props: Pick<ReportProps, "reportedName">) {
  return `New report: ${props.reportedName}`;
}

/** Tells an admin that a member reported someone. Reports should be acted on within 24 hours. */
export function Report(props: ReportProps) {
  return (
    <Layout preview={`${props.reportedName} was reported`} pauseUrl={props.pauseUrl}>
      <Heading as="h1" style={styles.heading}>
        {props.reportedName} was reported
      </Heading>
      <Text style={styles.text}>Reason: {props.reason}</Text>
      {props.note ? <Text style={styles.quote}>{props.note}</Text> : null}
      <Section>
        <Button href={props.reviewUrl} style={styles.primaryButton}>
          Review reports
        </Button>
      </Section>
      <Text style={styles.muted}>Please review it within 24 hours.</Text>
    </Layout>
  );
}
