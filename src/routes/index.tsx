import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Bug, GitPullRequest, ShieldCheck, Sparkles, ArrowRight, CheckCircle2, Github } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BugLens — AI-powered code review for engineers" },
      {
        name: "description",
        content:
          "BugLens reviews your pull requests with the rigor of a senior engineer. Catch bugs, regressions, and security issues before they ship.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Ambient gradient */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.72 0.19 295 / 0.18), transparent 70%)",
        }}
      />

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
              <Bug className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">BugLens</span>
          </Link>
          <nav className="ml-10 hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#docs" className="hover:text-foreground transition-colors">Docs</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/dashboard" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/dashboard">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Open app
                <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pt-24 pb-20 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3 text-primary" />
          Now reviewing in <span className="font-mono text-foreground">TypeScript · Python · Go · Rust</span>
        </div>
        <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight md:text-7xl">
          Ship code your{" "}
          <span className="bg-gradient-to-br from-primary to-primary/40 bg-clip-text text-transparent">
            senior engineer
          </span>{" "}
          would approve.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
          BugLens reviews every pull request with the rigor of a staff engineer — catching bugs,
          regressions, and security issues before they reach production.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/dashboard">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Start reviewing
              <ArrowRight className="ml-1 size-4" />
            </Button>
          </Link>
          <Button size="lg" variant="outline" className="border-border">
            <Github className="mr-2 size-4" />
            Install GitHub App
          </Button>
        </div>

        {/* Code preview card */}
        <div className="mx-auto mt-16 max-w-4xl rounded-xl border border-border bg-card/60 p-2 shadow-2xl shadow-primary/10">
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="size-2.5 rounded-full bg-destructive/60" />
            <span className="size-2.5 rounded-full bg-yellow-500/60" />
            <span className="size-2.5 rounded-full bg-emerald-500/60" />
            <span className="ml-3 font-mono text-[11px] text-muted-foreground">HuntBoard · src/hooks/useJobBoard.ts</span>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-background/60 p-5 text-left font-mono text-[12.5px] leading-relaxed text-muted-foreground">
{`  useEffect(() => {
    setLoading(true);
    fetchJobs(query).then((data) => {
      setJobs(data);
      setLoading(false);
    });
  }, [query]);`}
          </pre>
          <div className="m-2 rounded-md border-l-2 border-destructive bg-destructive/5 p-3 text-left text-xs">
            <p className="font-medium text-foreground">
              <span className="font-mono text-destructive">critical</span> · Unhandled promise rejection on line 8
            </p>
            <p className="mt-1 text-muted-foreground">
              A network error will leave <code className="rounded bg-muted px-1 font-mono">loading</code> stuck at true.
              Wrap in try/catch and wire an <code className="rounded bg-muted px-1 font-mono">AbortController</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {[
            {
              icon: GitPullRequest,
              title: "Reviews that read intent",
              body: "BugLens understands your stack — React state flows, MongoDB pipelines, OpenAI prompts — and reviews accordingly.",
            },
            {
              icon: ShieldCheck,
              title: "Security-first by default",
              body: "Catches secrets, injection, auth bypass, and supply-chain risk before they reach your main branch.",
            },
            {
              icon: Sparkles,
              title: "Inline fix suggestions",
              body: "Every finding ships with a one-click patch you can commit straight from the workspace.",
            },
          ].map((f) => (
            <div key={f.title} className="bg-background p-8">
              <div className="grid size-9 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
                <f.icon className="size-4" />
              </div>
              <h3 className="mt-5 text-base font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Three steps to your first review.
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", t: "Connect a repo", d: "Install the GitHub App and pick the repositories BugLens should watch." },
            { n: "02", t: "Open a pull request", d: "BugLens reviews the diff in seconds and posts findings inline." },
            { n: "03", t: "Merge with confidence", d: "Apply suggested patches or hop into the workspace for deeper analysis." },
          ].map((s) => (
            <div key={s.n} className="rounded-lg border border-border bg-card/40 p-6">
              <p className="font-mono text-xs text-primary">{s.n}</p>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-24 text-center">
        <div className="rounded-2xl border border-border bg-gradient-to-b from-primary/10 to-transparent px-8 py-16">
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Review your first PR in under 60 seconds.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Free for personal projects. No credit card required.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> 500 free reviews / month</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> Unlimited repos</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> SOC2-ready</span>
          </div>
          <Link to="/dashboard" className="mt-7 inline-block">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Open dashboard
              <ArrowRight className="ml-1 size-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Bug className="size-3.5 text-primary" />
            <span>BugLens · Built for engineers</span>
          </div>
          <span className="font-mono">© 2026 BugLens, Inc.</span>
        </div>
      </footer>
    </div>
  );
}
