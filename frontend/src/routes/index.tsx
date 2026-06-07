import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bug, ShieldAlert, FileCode2, Cpu, MessageSquareText, Github, Play, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BugLens — AI-Powered Code Reviews" },
      { name: "description", content: "Catch bugs, detect vulnerabilities, and automate PR reviews before you merge." },
    ],
  }),
  component: Index,
});

function LiveDemo() {
  const codeSnippet = `function authenticateUser(req, res) {
  const { token } = req.body;
  // Vulnerability: No token verification
  const user = db.findUserByToken(token);
  
  if (user) {
    res.status(200).send("Authenticated");
  } else {
    res.status(401).send("Unauthorized");
  }
}`;

  const aiCorrection = `> Analyzing AST...
> Vulnerability Detected: Broken Authentication (CWE-287)
> Generating patch using Multi-Model Engine...
> Suggesting fix:
  
+  const jwt = require('jsonwebtoken');
+  try {
+    const decoded = jwt.verify(token, process.env.JWT_SECRET);
+    const user = db.findUserById(decoded.id);
+    res.status(200).send("Authenticated");
+  } catch (err) {
+    res.status(401).send("Unauthorized");
+  }`;

  const [aiText, setAiText] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (started && aiText.length < aiCorrection.length) {
      const timer = setTimeout(() => {
        setAiText(aiCorrection.slice(0, aiText.length + 1));
      }, 15);
      return () => clearTimeout(timer);
    }
  }, [started, aiText, aiCorrection]);

  return (
    <div className="mx-auto mt-16 max-w-5xl rounded-2xl border border-border/50 bg-black/40 p-2 shadow-2xl shadow-primary/20 backdrop-blur-xl transition-all duration-500 hover:shadow-primary/30">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02] rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-destructive/80" />
          <span className="size-3 rounded-full bg-yellow-500/80" />
          <span className="size-3 rounded-full bg-emerald-500/80" />
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-white/5 px-3 py-1 rounded-full border border-white/10">
          <Terminal className="size-3" />
          <span>buglens-agent ~ preview</span>
        </div>
        <div className="w-12"></div>
      </div>
      <div className="grid md:grid-cols-2 gap-px bg-white/5">
        <div className="bg-[#0D0D12] p-6 font-mono text-[13px] leading-relaxed text-muted-foreground overflow-x-auto">
          <div className="text-white/40 mb-4 select-none">src/auth.js</div>
          <pre>
<span className="text-blue-400">function</span> <span className="text-yellow-200">authenticateUser</span>(req, res) {"{\n"}
  <span className="text-blue-400">const</span> {"{ "} token {" }"} = req.body;
  <span className="text-red-400 opacity-80">// Vulnerability: No token verification</span>
  <span className="text-blue-400">const</span> user = db.<span className="text-yellow-200">findUserByToken</span>(token);
  
  <span className="text-blue-400">if</span> (user) {"{\n"}
    res.<span className="text-yellow-200">status</span>(<span className="text-orange-300">200</span>).<span className="text-yellow-200">send</span>(<span className="text-green-300">"Authenticated"</span>);
  {"}"} <span className="text-blue-400">else</span> {"{\n"}
    res.<span className="text-yellow-200">status</span>(<span className="text-orange-300">401</span>).<span className="text-yellow-200">send</span>(<span className="text-green-300">"Unauthorized"</span>);
  {"}\n"}
{"}"}</pre>
        </div>
        <div className="bg-[#0D0D12] p-6 font-mono text-[13px] leading-relaxed relative overflow-hidden">
          <div className="text-primary/70 mb-4 select-none flex items-center gap-2">
            <Bug className="size-4" /> BugLens AI Output
          </div>
          <div className="text-emerald-400/90 whitespace-pre-wrap">
            {aiText}
            {started && aiText.length < aiCorrection.length && <span className="animate-pulse">_</span>}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D12] via-transparent to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

function Index() {
  return (
    <div className="min-h-screen bg-[#030303] text-foreground antialiased selection:bg-primary/30">
      {/* Dynamic Background Glow */}
      <div className="fixed inset-0 z-0 flex justify-center pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] w-[1000px] h-[600px] rounded-[100%] bg-primary/20 blur-[120px] opacity-50" />
      </div>

      <div className="relative z-10">


        {/* Nav */}
        <header className="sticky top-0 z-50 border-b border-white/5 bg-[#030303]/60 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center px-6 justify-between">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25 transition-all group-hover:bg-primary/20 group-hover:ring-primary/40">
                <Bug className="size-4.5" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight text-white">BugLens</span>
            </Link>
            
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/5 transition-colors hidden sm:flex">Sign In</Button>
              </Link>
              <Link to="/login">
                <Button className="bg-white text-black hover:bg-white/90 shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 pt-12 pb-20 text-center md:pt-16 md:pb-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-8 shadow-[0_0_30px_rgba(var(--primary),0.2)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            BugLens v2.0 is live
          </div>
          
          <h1 className="mx-auto max-w-4xl text-balance text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
            AI-Powered Code Reviews in Seconds.
          </h1>
          
          <p className="mx-auto mt-8 max-w-2xl text-balance text-lg text-white/60 md:text-xl">
            Catch bugs, detect vulnerabilities, and automate PR reviews before you merge. Build software with the rigor of a senior engineer.
          </p>
          
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" className="h-14 px-8 text-base bg-white text-black hover:bg-white/90 shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-all gap-2 group w-full rounded-xl">
                <Github className="size-5 transition-transform group-hover:scale-110" />
                Connect GitHub
              </Button>
            </Link>
          </div>
        </section>

        {/* Live Demo */}
        <section className="mx-auto max-w-7xl px-6 pb-24 md:pb-32">
          <LiveDemo />
        </section>

        {/* Features */}
        <section className="border-t border-white/5 bg-black/40 backdrop-blur-lg py-24 md:py-32 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center mb-16 md:mb-20">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6">
                Engineered for Reliability
              </h2>
              <p className="text-lg text-white/50 max-w-2xl mx-auto">
                Everything you need to ship secure, high-quality code at the speed of thought.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 auto-rows-fr">
              <Card className="group md:col-span-2 bg-white/[0.02] border-white/10 hover:bg-white/[0.04] transition-colors duration-300 shadow-none">
                <CardHeader>
                  <div className="inline-flex size-10 items-center justify-center rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 mb-2 transition-colors group-hover:bg-red-500/20">
                    <ShieldAlert className="size-5" />
                  </div>
                  <CardTitle className="text-xl text-white">Vulnerability Detection</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-white/60 leading-relaxed max-w-md">
                    Automatically spot OWASP top 10 vulnerabilities, leaked secrets, and insecure patterns. Get actionable fixes tailored to your specific framework and libraries.
                  </p>
                </CardContent>
              </Card>

              <Card className="group bg-white/[0.02] border-white/10 hover:bg-white/[0.04] transition-colors duration-300 shadow-none">
                <CardHeader>
                  <div className="inline-flex size-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-2 transition-colors group-hover:bg-blue-500/20">
                    <FileCode2 className="size-5" />
                  </div>
                  <CardTitle className="text-lg text-white">AST Parsing</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-white/60 leading-relaxed">
                    Deep contextual understanding. We parse the Abstract Syntax Tree to comprehend your code structure.
                  </p>
                </CardContent>
              </Card>

              <Card className="group bg-white/[0.02] border-white/10 hover:bg-white/[0.04] transition-colors duration-300 shadow-none">
                <CardHeader>
                  <div className="inline-flex size-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-2 transition-colors group-hover:bg-purple-500/20">
                    <Cpu className="size-5" />
                  </div>
                  <CardTitle className="text-lg text-white">Multi-Model Support</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-white/60 leading-relaxed">
                    Route tasks dynamically. We use the right LLM for the right job—whether it's reasoning, speed, or deep context windows.
                  </p>
                </CardContent>
              </Card>

              <Card className="group md:col-span-2 bg-white/[0.02] border-white/10 hover:bg-white/[0.04] transition-colors duration-300 shadow-none">
                <CardHeader>
                  <div className="inline-flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2 transition-colors group-hover:bg-emerald-500/20">
                    <MessageSquareText className="size-5" />
                  </div>
                  <CardTitle className="text-xl text-white">Repo Chat (RAG)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-white/60 leading-relaxed max-w-md">
                    Talk to your codebase. Ask complex questions about architecture, find undocumented features, and onboard new developers instantly.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-black/60 pt-12 pb-8">
          <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Bug className="size-5 text-white/50" />
              <span className="text-xl font-bold tracking-tight text-white/50">BugLens</span>
            </div>
            <div className="flex gap-6 text-sm text-white/40">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Twitter</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
