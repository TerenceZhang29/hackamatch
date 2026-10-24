/** Shows a slug the way people write it: `ux-design` → `ux design`. */
export function tagLabel(slug: string): string {
  return slug.replaceAll("-", " ");
}

/** Names that don't follow from the slug: acronyms, brand casing, and areas named differently. */
const DISPLAY: Readonly<Record<string, string>> = {
  // Areas (domains)
  edtech: "Education",
  civic: "Civic tech",
  nonprofit: "Social good",
  devtools: "Dev tools",
  "ai-tools": "AI tools",
  "enterprise-saas": "Enterprise SaaS",
  "hr-recruiting": "HR and recruiting",
  "security-privacy": "Security and privacy",
  ecommerce: "E-commerce",
  marketplace: "Marketplaces",
  // Skills
  fullstack: "Full stack",
  ios: "iOS",
  ml: "Machine learning",
  nlp: "NLP",
  "llm-apps": "LLM apps",
  devops: "DevOps",
  "api-design": "API design",
  iot: "IoT",
  "ar-vr": "AR/VR",
  "3d-modeling": "3D modeling",
  "ux-design": "UX design",
  "ui-design": "UI design",
  // Stack
  nextjs: "Next.js",
  typescript: "TypeScript",
  javascript: "JavaScript",
  "html-css": "HTML/CSS",
  nodejs: "Node.js",
  fastapi: "FastAPI",
  swiftui: "SwiftUI",
  "react-native": "React Native",
  cpp: "C++",
  csharp: "C#",
  dotnet: ".NET",
  php: "PHP",
  sql: "SQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  graphql: "GraphQL",
  aws: "AWS",
  gcp: "GCP",
  pytorch: "PyTorch",
  tensorflow: "TensorFlow",
  "scikit-learn": "scikit-learn",
  numpy: "NumPy",
  huggingface: "Hugging Face",
  langchain: "LangChain",
  "openai-api": "OpenAI API",
  "claude-api": "Claude API",
  opencv: "OpenCV",
  matlab: "MATLAB",
  "three-js": "Three.js",
  ros: "ROS",
  r: "R",
  c: "C",
  pandas: "pandas",
};

/** The name shown on sign-up chips and cards (P1-24): `ux-design` → `UX design`, `edtech` → `Education`. */
export function displayLabel(slug: string): string {
  const known = DISPLAY[slug];
  if (known) return known;
  const words = tagLabel(slug);
  return words.charAt(0).toUpperCase() + words.slice(1);
}
