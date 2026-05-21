export const currentUser = {
  name: "Srikar",
  role: "Full-Stack AI Engineer",
  email: "srikar@buglens.dev",
  initials: "SR",
};

export type Repo = {
  name: string;
  stack: string;
  language: string;
  issues: number;
  lastReview: string;
};

export const repositories: Repo[] = [
  {
    name: "HuntBoard",
    stack: "React · Tailwind CSS · Full-stack",
    language: "TypeScript",
    issues: 4,
    lastReview: "2h ago",
  },
  {
    name: "Z-STORE",
    stack: "MERN · Deployed on Render",
    language: "JavaScript",
    issues: 7,
    lastReview: "Yesterday",
  },
  {
    name: "co2_predict",
    stack: "Python · ML Models",
    language: "Python",
    issues: 2,
    lastReview: "3d ago",
  },
  {
    name: "ai-lead-engine",
    stack: "Next.js · OpenAI API",
    language: "TypeScript",
    issues: 5,
    lastReview: "5d ago",
  },
];

export type ActivityItem = {
  repo: string;
  message: string;
  author: string;
  time: string;
  severity: "info" | "warn" | "critical";
};

export const recentActivity: ActivityItem[] = [
  {
    repo: "HuntBoard",
    message: "Fix state hydration issue in React Router",
    author: "Srikar",
    time: "12 min ago",
    severity: "warn",
  },
  {
    repo: "Z-STORE",
    message: "Optimize MongoDB aggregation pipeline",
    author: "Srikar",
    time: "2h ago",
    severity: "info",
  },
  {
    repo: "ai-lead-engine",
    message: "Update OpenAI API prompt context",
    author: "Srikar",
    time: "Yesterday",
    severity: "critical",
  },
  {
    repo: "co2_predict",
    message: "Refactor linear regression training loop",
    author: "Srikar",
    time: "2d ago",
    severity: "info",
  },
  {
    repo: "Z-STORE",
    message: "Add JWT refresh middleware to Express server",
    author: "Srikar",
    time: "3d ago",
    severity: "warn",
  },
];

export const sampleCode = `// HuntBoard · src/hooks/useJobBoard.ts
import { useEffect, useState } from "react";
import { fetchJobs } from "@/lib/api";

export function useJobBoard(query: string) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchJobs(query).then((data) => {
      setJobs(data);
      setLoading(false);
    });
  }, [query]);

  return { jobs, loading };
}
`;

export type ReviewComment = {
  line: number;
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
};

export const reviewComments: ReviewComment[] = [
  {
    line: 4,
    severity: "warn",
    title: "Missing dependency array safety",
    body: "Consider memoizing `query` upstream — string identity changes will retrigger fetches even when semantically equal.",
  },
  {
    line: 8,
    severity: "critical",
    title: "Unhandled promise rejection",
    body: "`fetchJobs` lacks a `.catch` — a network error will leave `loading` stuck at true. Wrap in try/catch with an AbortController.",
  },
  {
    line: 11,
    severity: "info",
    title: "Type the return value",
    body: "Inferred `any[]` for `jobs`. Add `Job[]` from your shared types to keep consumers safe.",
  },
];
