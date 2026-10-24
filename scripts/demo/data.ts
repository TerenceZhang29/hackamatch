/**
 * Hand-written demo profiles for a production pilot (docs/plans/demo-profiles.md).
 * Tags are taxonomy slugs, written here so no AI runs. Edit, then `pnpm demo:sql`.
 */

export type DemoRole = "idea" | "builder" | "both";

export interface DemoIdea {
  pitch: string;
  rawText: string;
  domain: string;
  skillsNeeded: string[];
  scope: "weekend" | "few_weeks" | "ongoing";
}

export interface DemoPerson {
  name: string;
  role: DemoRole;
  summary: string;
  skills: string[];
  stack: string[];
  domains: string[];
  experience: "beginner" | "intermediate" | "advanced";
  ideas?: DemoIdea[];
}

const idea = (
  pitch: string,
  domain: string,
  skillsNeeded: string[],
  scope: DemoIdea["scope"] = "weekend",
): DemoIdea => ({ pitch, rawText: pitch, domain, skillsNeeded, scope });

export const DEMO_PEOPLE: DemoPerson[] = [
  // Builders
  {
    name: "Aiden Park",
    role: "builder",
    summary: "Full-stack engineer who ships React and Node apps fast.",
    skills: ["fullstack", "frontend"],
    stack: ["react", "nextjs", "nodejs", "postgres"],
    domains: ["devtools", "productivity"],
    experience: "advanced",
  },
  {
    name: "Bianca Rossi",
    role: "builder",
    summary: "iOS developer who loves health and fitness apps.",
    skills: ["mobile", "ios"],
    stack: ["swift", "swiftui", "firebase"],
    domains: ["health", "fitness"],
    experience: "intermediate",
  },
  {
    name: "Caleb Wright",
    role: "builder",
    summary: "ML engineer working on language models and retrieval.",
    skills: ["ml", "nlp", "llm-apps"],
    stack: ["python", "pytorch", "huggingface", "langchain"],
    domains: ["ai-tools", "edtech"],
    experience: "advanced",
  },
  {
    name: "Dana Kim",
    role: "builder",
    summary: "Product designer: research, flows and Figma prototypes.",
    skills: ["ux-design", "ui-design", "user-research"],
    stack: ["figma"],
    domains: ["health", "civic"],
    experience: "intermediate",
  },
  {
    name: "Elias Mendes",
    role: "builder",
    summary: "Backend engineer who likes APIs, data pipelines and Go.",
    skills: ["backend", "api-design", "data-engineering"],
    stack: ["go", "postgres", "docker", "aws"],
    domains: ["fintech", "logistics"],
    experience: "advanced",
  },
  {
    name: "Fiona Walsh",
    role: "builder",
    summary: "Data scientist who turns messy data into clear charts.",
    skills: ["data-science", "data-visualization"],
    stack: ["python", "pandas", "tableau", "sql"],
    domains: ["climate", "energy"],
    experience: "intermediate",
  },
  {
    name: "Gabriel Osei",
    role: "builder",
    summary: "Android and Flutter developer, first hackathon this fall.",
    skills: ["mobile", "android"],
    stack: ["kotlin", "flutter", "dart"],
    domains: ["transportation", "campus-life"],
    experience: "beginner",
  },
  {
    name: "Hana Sato",
    role: "builder",
    summary: "Hardware tinkerer: sensors, Arduino and Raspberry Pi.",
    skills: ["hardware", "embedded", "iot"],
    stack: ["arduino", "raspberry-pi", "cpp", "python"],
    domains: ["smart-home", "climate"],
    experience: "intermediate",
  },
  {
    name: "Ian Brooks",
    role: "builder",
    summary: "Frontend engineer focused on accessible, fast interfaces.",
    skills: ["frontend", "ui-design"],
    stack: ["typescript", "react", "tailwind"],
    domains: ["accessibility", "edtech"],
    experience: "advanced",
  },
  {
    name: "Jade Nguyen",
    role: "builder",
    summary: "Computer vision researcher who builds quick demos.",
    skills: ["computer-vision", "ml", "research"],
    stack: ["python", "opencv", "pytorch"],
    domains: ["health", "agriculture"],
    experience: "advanced",
  },
  {
    name: "Kofi Mensah",
    role: "builder",
    summary: "Cloud and DevOps engineer who keeps demos online.",
    skills: ["devops", "cloud", "security"],
    stack: ["kubernetes", "terraform", "gcp", "linux"],
    domains: ["security-privacy", "enterprise-saas"],
    experience: "intermediate",
  },
  {
    name: "Lena Fischer",
    role: "builder",
    summary: "Game developer working in Unity and three.js.",
    skills: ["game-dev", "3d-modeling"],
    stack: ["unity", "csharp", "three-js"],
    domains: ["gaming", "edtech"],
    experience: "intermediate",
  },
  // Idea people
  {
    name: "Marcus Lee",
    role: "idea",
    summary: "MBA student who ran ops at a hospital.",
    skills: ["product-management", "operations"],
    stack: [],
    domains: ["health"],
    experience: "intermediate",
    ideas: [
      idea(
        "Let nurses swap shifts in minutes, without a manager in the loop.",
        "health",
        ["frontend", "backend", "mobile"],
        "few_weeks",
      ),
    ],
  },
  {
    name: "Nadia Haddad",
    role: "idea",
    summary: "Policy student focused on housing and tenant rights.",
    skills: ["research", "content-writing"],
    stack: [],
    domains: ["civic", "real-estate"],
    experience: "beginner",
    ideas: [
      idea("A plain-language guide that helps renters check if a lease is fair.", "civic", [
        "frontend",
        "nlp",
      ]),
    ],
  },
  {
    name: "Omar Siddiqui",
    role: "idea",
    summary: "Former teacher building tools for classrooms.",
    skills: ["product-management", "user-research"],
    stack: [],
    domains: ["edtech"],
    experience: "intermediate",
    ideas: [
      idea(
        "Turn lecture recordings into flashcards automatically.",
        "edtech",
        ["ml", "frontend"],
        "few_weeks",
      ),
    ],
  },
  {
    name: "Priya Raman",
    role: "idea",
    summary: "Sustainability lead for a campus club.",
    skills: ["community-building", "marketing"],
    stack: [],
    domains: ["climate", "campus-life"],
    experience: "beginner",
    ideas: [
      idea("A live map of campus building energy use, so students can see waste.", "energy", [
        "data-visualization",
        "frontend",
        "iot",
      ]),
    ],
  },
  {
    name: "Quinn Taylor",
    role: "idea",
    summary: "Ex-consultant exploring small-business finance.",
    skills: ["finance", "business-development"],
    stack: [],
    domains: ["fintech"],
    experience: "advanced",
    ideas: [
      idea(
        "Simple cash-flow forecasts for food trucks and small shops.",
        "fintech",
        ["backend", "data-analysis", "frontend"],
        "ongoing",
      ),
    ],
  },
  {
    name: "Rosa Alvarez",
    role: "idea",
    summary: "Public health student who volunteers at clinics.",
    skills: ["research", "project-management"],
    stack: [],
    domains: ["health", "nonprofit"],
    experience: "intermediate",
    ideas: [
      idea("Help free clinics text patients reminders in their own language.", "health", [
        "backend",
        "nlp",
      ]),
    ],
  },
  {
    name: "Sam Okafor",
    role: "idea",
    summary: "Musician who wants better tools for bands.",
    skills: ["video-production", "marketing"],
    stack: [],
    domains: ["music", "creator-tools"],
    experience: "beginner",
    ideas: [
      idea("A setlist planner that keeps a band's songs, keys and timing in sync.", "music", [
        "mobile",
        "frontend",
      ]),
    ],
  },
  {
    name: "Tara Gupta",
    role: "idea",
    summary: "Biotech PhD student tired of messy lab notebooks.",
    skills: ["research"],
    stack: [],
    domains: ["biotech"],
    experience: "advanced",
    ideas: [
      idea(
        "A shared lab notebook that turns protocols into checklists.",
        "biotech",
        ["fullstack", "ux-design"],
        "few_weeks",
      ),
    ],
  },
  {
    name: "Uma Patel",
    role: "idea",
    summary: "Organizes rides home for students over breaks.",
    skills: ["operations", "community-building"],
    stack: [],
    domains: ["transportation", "campus-life"],
    experience: "intermediate",
    ideas: [
      idea("Match students driving home with riders going the same way.", "transportation", [
        "mobile",
        "backend",
      ]),
    ],
  },
  {
    name: "Victor Chen",
    role: "idea",
    summary: "Accessibility advocate and screen-reader user.",
    skills: ["user-research", "testing"],
    stack: [],
    domains: ["accessibility"],
    experience: "intermediate",
    ideas: [
      idea(
        "A browser extension that rewrites cluttered pages for screen readers.",
        "accessibility",
        ["frontend", "llm-apps"],
      ),
    ],
  },
  // Both
  {
    name: "Wren Adams",
    role: "both",
    summary: "Designer who also codes the front end.",
    skills: ["ux-design", "frontend"],
    stack: ["figma", "react", "typescript"],
    domains: ["mental-health", "productivity"],
    experience: "intermediate",
    ideas: [
      idea("A two-minute daily check-in app for grad student stress.", "mental-health", [
        "mobile",
        "backend",
      ]),
    ],
  },
  {
    name: "Xavier Diaz",
    role: "both",
    summary: "Backend engineer with a fintech idea.",
    skills: ["backend", "api-design"],
    stack: ["python", "fastapi", "postgres"],
    domains: ["fintech"],
    experience: "advanced",
    ideas: [
      idea("Split rent and utilities between roommates, settled every month.", "fintech", [
        "frontend",
        "mobile",
      ]),
    ],
  },
  {
    name: "Yara Haddad",
    role: "both",
    summary: "Data engineer who wants to fix food waste.",
    skills: ["data-engineering", "data-analysis"],
    stack: ["python", "sql", "spark"],
    domains: ["food", "climate"],
    experience: "intermediate",
    ideas: [
      idea("Route leftover dining hall food to student groups before it's thrown out.", "food", [
        "mobile",
        "frontend",
      ]),
    ],
  },
  {
    name: "Zane Morgan",
    role: "both",
    summary: "AR developer with a campus tour idea.",
    skills: ["ar-vr", "mobile"],
    stack: ["unity", "swift"],
    domains: ["campus-life", "travel"],
    experience: "intermediate",
    ideas: [
      idea("An AR tour that guides visitors around Roosevelt Island.", "travel", [
        "3d-modeling",
        "ux-design",
      ]),
    ],
  },
  {
    name: "Ava Thompson",
    role: "both",
    summary: "ML student with an idea for study groups.",
    skills: ["ml", "backend"],
    stack: ["python", "scikit-learn", "django"],
    domains: ["edtech"],
    experience: "beginner",
    ideas: [
      idea("Match students into study groups by schedule and course.", "edtech", [
        "frontend",
        "ux-design",
      ]),
    ],
  },
  {
    name: "Ben Carter",
    role: "both",
    summary: "Security engineer with a privacy idea.",
    skills: ["security", "backend"],
    stack: ["rust", "go"],
    domains: ["security-privacy"],
    experience: "advanced",
    ideas: [
      idea("A one-click privacy check that shows which apps share your data.", "security-privacy", [
        "frontend",
        "mobile",
      ]),
    ],
  },
  {
    name: "Chloe Martin",
    role: "both",
    summary: "Climate researcher who builds sensors.",
    skills: ["hardware", "data-science"],
    stack: ["arduino", "python"],
    domains: ["climate", "agriculture"],
    experience: "intermediate",
    ideas: [
      idea("Cheap soil sensors that tell urban gardens when to water.", "agriculture", [
        "iot",
        "frontend",
        "data-visualization",
      ]),
    ],
  },
  {
    name: "Diego Ramos",
    role: "both",
    summary: "Full-stack developer and amateur chef.",
    skills: ["fullstack"],
    stack: ["nextjs", "supabase", "stripe"],
    domains: ["food", "marketplace"],
    experience: "intermediate",
    ideas: [
      idea("A marketplace where students sell home-cooked meals to classmates.", "marketplace", [
        "ux-design",
        "mobile",
      ]),
    ],
  },
];
