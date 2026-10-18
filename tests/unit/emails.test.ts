import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { displayName } from "@/lib/display-name";
import { createResendProvider } from "@/lib/notify/resend";
import { InboundInterest, inboundInterestSubject } from "@/lib/notify/templates/InboundInterest";
import { Mutual, mutualSubject } from "@/lib/notify/templates/Mutual";

vi.mock("@/lib/config", () => ({ getConfig: () => ({ LLM_PROVIDER: "fake" }) }));

describe("InboundInterest email", () => {
  const props = {
    variant: "interest" as const,
    otherName: "Sofia",
    otherSummary: "Frontend engineer who builds React apps for health.",
    ideaPitch: "Let nurses swap shifts in minutes.",
    reason: null,
    interestedUrl: "https://app.test/r/yes",
    passUrl: "https://app.test/r/no",
    pauseUrl: "https://app.test/r/pause",
  };

  it("has both one-click links, the footer, and no contact details", async () => {
    const html = await render(createElement(InboundInterest, props));
    expect(html).toContain('href="https://app.test/r/yes"');
    expect(html).toContain('href="https://app.test/r/no"');
    expect(html).toContain('href="https://app.test/r/pause"');
    expect(html).toContain("Sofia is interested in your idea");
    expect(html).not.toContain("@cornell.edu");
    expect(inboundInterestSubject(props)).toBe("Sofia is interested in building with you");
    expect(inboundInterestSubject({ ...props, variant: "intro" })).toBe(
      "We think you should meet Sofia",
    );
  });

  it("renders a plain-text version", async () => {
    const text = await render(createElement(InboundInterest, props), { plainText: true });
    expect(text).toContain("I'm interested");
    expect(text).toContain("https://app.test/r/yes");
  });
});

describe("Mutual email", () => {
  it("shares contact details and the suggested message", async () => {
    const props = {
      other: {
        name: "Maya",
        email: "ut-101@cornell.edu",
        summary: null,
        githubUrl: "https://github.com/maya",
        linkedinUrl: null,
      },
      ideaPitch: null,
      coffeeChat: "Hi Maya, coffee this week?",
      matchUrl: "https://app.test/matches/1",
      pauseUrl: "https://app.test/r/pause",
    };
    const html = await render(createElement(Mutual, props));
    expect(html).toContain("mailto:ut-101@cornell.edu");
    expect(html).toContain("https://github.com/maya");
    expect(html).toContain("Hi Maya, coffee this week?");
    expect(html).toContain('href="https://app.test/matches/1"');
    expect(mutualSubject(props)).toBe("It's a match: you and Maya");
  });
});

describe("createResendProvider", () => {
  it("posts the message and returns Resend's id", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }),
    );
    const provider = createResendProvider({
      apiKey: "re_test",
      from: "HackaMatch <hi@x.test>",
      fetchImpl,
    });
    const result = await provider.send({
      to: "ut-102@cornell.edu",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      headers: { "List-Unsubscribe": "<https://x.test/u>" },
    });
    expect(result).toEqual({ id: "msg_1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "HackaMatch <hi@x.test>",
      to: ["ut-102@cornell.edu"],
      headers: { "List-Unsubscribe": "<https://x.test/u>" },
    });
  });

  it("throws on an error response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 422 }));
    const provider = createResendProvider({ apiKey: "k", from: "f", fetchImpl });
    await expect(provider.send({ to: "a", subject: "s", html: "h", text: "t" })).rejects.toThrow(
      /422/,
    );
  });
});

describe("displayName", () => {
  it("matches the SQL display_name function", () => {
    expect(displayName("Maya Patel")).toBe("Maya P.");
    expect(displayName("Cher")).toBe("Cher");
    expect(displayName("  ")).toBe("Cornell student");
    expect(displayName(null)).toBe("Cornell student");
    expect(displayName("Ana de la Cruz")).toBe("Ana C.");
  });
});

describe("writeCoffeeChat", () => {
  it("uses the fake LLM and stays under 50 words", async () => {
    const { writeCoffeeChat, coffeeChatTemplate } = await import("@/lib/llm/coffee-chat");
    const facts = {
      senderName: "Sofia",
      recipientName: "Maya",
      ideaPitch: "Let nurses swap shifts in minutes.",
      recipientSummary: null,
    };
    const message = await writeCoffeeChat(facts);
    expect(message).toBe(coffeeChatTemplate(facts));
    expect(message).toContain("15-minute coffee at Cornell Tech");
    expect(message.split(/\s+/).length).toBeLessThanOrEqual(50);
  });
});
