import { describe, expect, it } from "vitest";
import { fakeLlm } from "@/lib/llm/fake";
import { EVENT_TOOL } from "@/lib/llm/prompts";
import { draftToValues, eventDraftSchema, type EventDraft } from "@/server/event-autofill";
import {
  EventPageError,
  checkPublicUrl,
  fetchEventPageText,
  htmlToText,
  isPrivateAddress,
} from "@/server/event-page";

const publicDns = async () => ["93.184.216.34"];

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and mapped addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });
});

describe("checkPublicUrl", () => {
  it("needs https on a public host", async () => {
    await expect(
      checkPublicUrl(new URL("https://hack.example"), publicDns),
    ).resolves.toBeUndefined();
    await expect(checkPublicUrl(new URL("http://hack.example"), publicDns)).rejects.toThrow(
      "https",
    );
    await expect(checkPublicUrl(new URL("https://127.0.0.1/"), publicDns)).rejects.toThrow(
      "public internet",
    );
    // A public name that resolves to a private address is refused too.
    await expect(
      checkPublicUrl(new URL("https://sneaky.example"), async () => ["93.184.216.34", "10.0.0.5"]),
    ).rejects.toThrow("public internet");
    await expect(checkPublicUrl(new URL("https://u:p@hack.example"), publicDns)).rejects.toThrow(
      "login",
    );
  });
});

function page(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

describe("fetchEventPageText", () => {
  it("returns the page's text", async () => {
    const result = await fetchEventPageText("https://hack.example/", {
      resolve: publicDns,
      fetch: async () => page("<title>Hack</title><p>Dec 5 &amp; 6</p>"),
    });
    expect(result.text).toContain("Title: Hack");
    expect(result.text).toContain("Dec 5 & 6");
  });

  it("checks each redirect, and stops after 3", async () => {
    const toPrivate = fetchEventPageText("https://hack.example/", {
      resolve: async (host) => (host === "internal.example" ? ["10.0.0.1"] : ["93.184.216.34"]),
      fetch: async () =>
        new Response(null, { status: 302, headers: { location: "https://internal.example/" } }),
    });
    await expect(toPrivate).rejects.toThrow("public internet");

    const loop = fetchEventPageText("https://hack.example/", {
      resolve: publicDns,
      fetch: async () => new Response(null, { status: 301, headers: { location: "/again" } }),
    });
    await expect(loop).rejects.toThrow("Too many redirects");
  });

  it("refuses non-pages, errors and huge pages", async () => {
    const opts = (response: Response) => ({ resolve: publicDns, fetch: async () => response });
    await expect(
      fetchEventPageText(
        "https://hack.example/x.pdf",
        opts(new Response("%PDF", { headers: { "content-type": "application/pdf" } })),
      ),
    ).rejects.toThrow("isn't a web page");
    await expect(
      fetchEventPageText("https://hack.example/", opts(page("gone", { status: 404 }))),
    ).rejects.toThrow("404");
    await expect(
      fetchEventPageText("https://hack.example/", opts(page("x".repeat(2_100_000)))),
    ).rejects.toThrow("too large");
    await expect(fetchEventPageText("nope", opts(page("")))).rejects.toBeInstanceOf(EventPageError);
  });
});

describe("htmlToText", () => {
  it("keeps the title, descriptions and JSON-LD; drops scripts and styles", () => {
    const text = htmlToText(`<html><head><title>Health AI</title>
      <meta name="description" content="Build health tools">
      <script type="application/ld+json">{"@type":"Event","startDate":"2026-12-05"}</script>
      <script>window.track()</script><style>p{color:red}</style></head>
      <body><nav>Home</nav><h1>Health AI Buildathon</h1><p>24 hours,<br>free.</p><!-- hidden --></body></html>`);
    expect(text).toContain("Title: Health AI");
    expect(text).toContain("Description: Build health tools");
    expect(text).toContain('"startDate":"2026-12-05"');
    expect(text).toContain("Health AI Buildathon\n24 hours,\nfree.");
    expect(text).not.toContain("window.track");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("hidden");
  });
});

const emptyDraft: EventDraft = eventDraftSchema.parse({
  description: null,
  start_date: null,
  end_date: null,
  time_label: null,
  venue: null,
  host: null,
  domains: [],
  format: null,
  length_hours: null,
  entry_fee_usd: null,
  open_to: null,
  level: null,
  apply_by: null,
  apply_url: null,
  admission: null,
  capacity: null,
  prize_total_usd: null,
  prizes: [],
  tracks: [],
  tools: null,
  judging: [],
  schedule: [],
  perks: [],
  perk_notes: null,
  chat_url: null,
});

describe("draftToValues", () => {
  it("leaves out what the page didn't say", () => {
    expect(draftToValues(emptyDraft)).toEqual({});
  });

  it("cleans the model's draft into form values", () => {
    const values = draftToValues({
      ...emptyDraft,
      description: "  A health hackathon.  ",
      start_date: "2026-12-05",
      end_date: "Dec 6",
      domains: ["health", "not-an-area"],
      format: "in_person",
      entry_fee_usd: 0,
      prize_total_usd: 12000,
      prizes: [
        { label: "1st place", amount_usd: 5000, note: null },
        { label: "  ", amount_usd: 1, note: null },
      ],
      tracks: [
        { name: "Less paperwork", description: "Notes", skills: ["ml", "Backend", "magic"] },
      ],
      judging: [{ criterion: "Impact", weight_pct: 130 }],
      perks: ["meals", "spa"],
      apply_url: "http://insecure.example",
      chat_url: "https://discord.gg/abc",
    });
    expect(values).toEqual({
      description: "A health hackathon.",
      startDate: "2026-12-05",
      domains: ["health"],
      format: "in_person",
      entryFee: "Free",
      prizeTotal: "$12,000",
      prizesText: "1st place | $5,000",
      tracksText: "Less paperwork | Notes | Machine learning, Backend",
      judgingText: "Impact",
      perks: ["meals"],
      chatUrl: "https://discord.gg/abc",
    });
  });
});

describe("draftToValues, cleanup", () => {
  it("drops an apply link that is just the event page again", () => {
    const pages = ["https://lu.ma/abc", "https://luma.com/abc"];
    expect(draftToValues({ ...emptyDraft, apply_url: "https://luma.com/abc/" }, pages)).toEqual({});
    expect(
      draftToValues({ ...emptyDraft, apply_url: "https://forms.example/apply" }, pages).applyUrl,
    ).toBe("https://forms.example/apply");
  });

  it("cuts a long 'open to' at a word, with an ellipsis", () => {
    const openTo = draftToValues({
      ...emptyDraft,
      open_to:
        "Software engineers and developers, AI and ML builders, technical students and recent graduates with strong programming fundamentals",
    }).openTo!;
    expect(openTo.length).toBeLessThanOrEqual(120);
    expect(openTo).toMatch(/ with strong…$|recent graduates…$|programming…$/);
    expect(openTo).not.toMatch(/funda…$/);
  });
});

describe("the fake model's event rule", () => {
  it("drafts from keywords, so local runs exercise the real path", async () => {
    const draft = await fakeLlm.structured({
      system: "",
      user: `<page>\nDescription: A weekend of building health tools with clinicians.\nIn person, beginners welcome, free. $12,000 in prizes. Meals and mentors.\nTrack: Less paperwork - draft clinical notes with machine learning and a backend\n</page>`,
      schema: eventDraftSchema,
      toolName: EVENT_TOOL,
    });
    const values = draftToValues(draft);
    expect(values).toMatchObject({
      description: "A weekend of building health tools with clinicians.",
      format: "in_person",
      level: "beginner",
      entryFee: "Free",
      prizeTotal: "$12,000",
      perks: ["meals", "mentors"],
    });
    expect(values.tracksText).toMatch(/^Less paperwork \| draft clinical notes/);
  });
});
