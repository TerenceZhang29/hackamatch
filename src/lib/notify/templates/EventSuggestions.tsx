import { Button, Heading, Section, Text } from "@react-email/components";
import { Layout, styles } from "./Layout";

export interface EventSuggestionsProps {
  items: { name: string; dates: string; venue: string | null }[];
  reviewUrl: string;
  pauseUrl: string;
}

export function eventSuggestionsSubject(props: Pick<EventSuggestionsProps, "items">) {
  const n = props.items.length;
  return `${n} new hackathon${n === 1 ? "" : "s"} to review`;
}

/**
 * Tells an admin what the weekly discovery job found
 * (docs/plans/event-discovery.md). Nothing is shown to members until an
 * admin reviews and saves each one.
 */
export function EventSuggestions(props: EventSuggestionsProps) {
  const subject = eventSuggestionsSubject(props);
  return (
    <Layout preview={subject} pauseUrl={props.pauseUrl}>
      <Heading as="h1" style={styles.heading}>
        {subject}
      </Heading>
      <Text style={styles.text}>
        This week&apos;s check found these. None is shown to members until you review and save it.
      </Text>
      {props.items.map((item) => (
        <Text key={`${item.name}-${item.dates}`} style={styles.text}>
          <strong>{item.name}</strong>
          <br />
          {item.venue ? `${item.dates} · ${item.venue}` : item.dates}
        </Text>
      ))}
      <Section>
        <Button href={props.reviewUrl} style={styles.primaryButton}>
          Review hackathons
        </Button>
      </Section>
    </Layout>
  );
}
