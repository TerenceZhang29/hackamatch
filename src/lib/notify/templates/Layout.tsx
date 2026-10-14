import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export const styles = {
  body: {
    backgroundColor: "#ffffff",
    fontFamily: "-apple-system, Segoe UI, Helvetica, Arial, sans-serif",
    color: "#171717",
  },
  container: { margin: "0 auto", padding: "24px 16px", maxWidth: "560px" },
  brand: { fontSize: "14px", fontWeight: 700, margin: "0 0 16px" },
  heading: { fontSize: "22px", fontWeight: 700, margin: "0 0 12px", lineHeight: "1.3" },
  text: { fontSize: "15px", lineHeight: "1.5", margin: "0 0 12px" },
  muted: { fontSize: "13px", lineHeight: "1.5", color: "#737373", margin: "0 0 8px" },
  card: { border: "1px solid #e5e5e5", borderRadius: "12px", padding: "16px", margin: "0 0 16px" },
  primaryButton: {
    backgroundColor: "#171717",
    color: "#ffffff",
    borderRadius: "8px",
    padding: "10px 16px",
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-block",
  },
  secondaryButton: {
    border: "1px solid #d4d4d4",
    color: "#171717",
    borderRadius: "8px",
    padding: "9px 16px",
    fontSize: "15px",
    textDecoration: "none",
    display: "inline-block",
  },
  quote: {
    borderLeft: "3px solid #d4d4d4",
    padding: "4px 12px",
    margin: "0 0 16px",
    fontSize: "15px",
    lineHeight: "1.5",
    color: "#404040",
  },
} as const;

/** Shared frame for every HackaMatch email, with the pause / manage footer. */
export function Layout({
  preview,
  pauseUrl,
  children,
}: {
  preview: string;
  pauseUrl: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>HackaMatch</Text>
          {children}
          <Hr style={{ borderColor: "#e5e5e5", margin: "24px 0 12px" }} />
          <Section>
            <Text style={styles.muted}>
              Getting too many emails?{" "}
              <Link href={pauseUrl} style={{ color: "#737373" }}>
                Pause matches or manage notifications
              </Link>
              .
            </Text>
            <Text style={styles.muted}>
              HackaMatch pairs Cornell students with ideas and builders.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
