import * as React from "react";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth, getIdToken } from "@/context/AuthContext";
import {
  Github,
  Copy,
  Check,
  Key,
  User,
  Settings as SettingsIcon,
  Link as LinkIcon,
  Info,
  ShieldCheck,
  Eye,
  EyeOff,
  ExternalLink,
  BookOpen,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { toast } from "sonner";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

export function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"general" | "github">("github");
  const [showSecret, setShowSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // DB Settings and keys state
  const [webhookSecret, setWebhookSecret] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showGithubToken, setShowGithubToken] = useState(false);

  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGemini, setShowGemini] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  // Fetch settings from API
  React.useEffect(() => {
    let active = true;
    const fetchSettings = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const token = await getIdToken();
        const res = await fetch(`${BACKEND_URL}/api/v1/settings`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok && active) {
          const data = await res.json();
          setWebhookSecret(data.webhook_secret || "");
          setGithubToken(data.github_access_token || "");
          setOpenaiKey(data.openai_api_key || "");
          setGeminiKey(data.gemini_api_key || "");
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
        toast.error("Failed to load settings from server.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchSettings();
    return () => {
      active = false;
    };
  }, [user]);

  // Save settings helper
  const handleSaveSettings = async (keys: {
    github_access_token?: string;
    openai_api_key?: string;
    gemini_api_key?: string;
  }) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/v1/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(keys),
      });
      if (res.ok) {
        const data = await res.json();
        setWebhookSecret(data.webhook_secret || "");
        setGithubToken(data.github_access_token || "");
        setOpenaiKey(data.openai_api_key || "");
        setGeminiKey(data.gemini_api_key || "");
        toast.success("Settings saved successfully!");
      } else {
        const errorData = await res.json();
        toast.error(errorData.detail || "Failed to save settings");
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast.error("Failed to save settings. Please try again.");
    }
  };

  const handleSaveGeneralKeys = () => {
    handleSaveSettings({
      openai_api_key: openaiKey,
      gemini_api_key: geminiKey,
    });
  };

  // Payload URL
  const payloadUrl = useMemo(() => {
    const domain = window.location.origin.includes("localhost")
      ? "https://your-api-domain.com"
      : window.location.origin;
    return `${domain}/api/v1/webhook/github?user_id=${user?.uid ?? "USER_UID"}`;
  }, [user?.uid]);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(payloadUrl);
    setCopiedUrl(true);
    toast.success("Payload URL copied to clipboard");
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(webhookSecret);
    setCopiedSecret(true);
    toast.success("Webhook Secret copied to clipboard");
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <AppShell crumbs={[{ label: "BugLens", to: "/" }, { label: "Settings" }]}>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 animate-in fade-in duration-500">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure integrations, API keys, and manage your BugLens account.
          </p>
        </div>

        {/* Dashboard Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Sidebar Nav */}
          <div className="flex flex-col gap-1.5 md:col-span-1">
            <button
              onClick={() => setActiveTab("github")}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === "github"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <Github className="size-4 shrink-0" />
              GitHub Integration
            </button>
            <button
              onClick={() => setActiveTab("general")}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === "general"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <SettingsIcon className="size-4 shrink-0" />
              General & API Keys
            </button>
          </div>

          {/* Settings Panels */}
          <div className="md:col-span-3 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center min-h-[350px] rounded-xl border border-border/60 bg-card/30 shadow-md">
                <Loader2 className="size-8 text-primary animate-spin" />
                <span className="mt-3 text-sm text-muted-foreground font-medium">Loading settings...</span>
              </div>
            ) : (
              <>
                {activeTab === "github" && (
                  <>
                    {/* Webhook Configuration Card */}
                    <Card className="border-border/60 bg-card/30 shadow-md">
                      <CardHeader className="border-b border-border/40 pb-5">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-lg bg-primary/10 p-2 text-primary">
                            <LinkIcon className="size-5" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">Webhook Configuration</CardTitle>
                            <CardDescription>
                              Automate your code reviews by linking your GitHub repository to the BugLens review engine.
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-6 space-y-6">
                        {/* Payload URL Field */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <span>Payload URL</span>
                            <span title="Copy this URL to paste into your GitHub Webhook settings">
                              <Info className="size-3.5 text-muted-foreground cursor-help" />
                            </span>
                          </label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={payloadUrl}
                              className="flex-1 font-mono text-xs bg-muted/20 border-border/60 text-muted-foreground select-all"
                            />
                            <Button
                              onClick={handleCopyUrl}
                              variant="secondary"
                              size="sm"
                              className="border border-border/60 gap-1.5 shrink-0"
                            >
                              {copiedUrl ? (
                                <>
                                  <Check className="size-3.5 text-green-500" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3.5" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                            <Info className="size-3 shrink-0 text-primary" />
                            <span>
                              For local testing, replace the domain <code className="text-foreground bg-muted/40 px-1 py-0.5 rounded">your-api-domain.com</code> with your local forwarding address (e.g. your <code className="text-foreground bg-muted/40 px-1 py-0.5 rounded">ngrok</code> URL).
                            </span>
                          </p>
                        </div>

                        {/* Webhook Secret Field */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <span>Webhook Secret</span>
                            <span title="Used to secure the signature of incoming webhook payloads">
                              <ShieldCheck className="size-3.5 text-muted-foreground cursor-help" />
                            </span>
                          </label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                type={showSecret ? "text" : "password"}
                                readOnly
                                value={webhookSecret}
                                className="w-full font-mono text-xs bg-muted/20 border-border/60 text-muted-foreground"
                              />
                              <button
                                type="button"
                                onClick={() => setShowSecret(!showSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                            </div>
                            <Button
                              onClick={handleCopySecret}
                              variant="secondary"
                              size="sm"
                              className="border border-border/60 gap-1.5 shrink-0"
                            >
                              {copiedSecret ? (
                                <>
                                  <Check className="size-3.5 text-green-500" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3.5" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* GitHub Access Token Card */}
                    <Card className="border-border/60 bg-card/30 shadow-md">
                      <CardHeader className="border-b border-border/40 pb-5">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-lg bg-primary/10 p-2 text-primary">
                            <Github className="size-5" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">GitHub Access Token</CardTitle>
                            <CardDescription>
                              Configure your personal GitHub Access Token so BugLens can access your repository pull requests and post review comments.
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-6 space-y-6">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <span>Personal Access Token</span>
                            <span title="Your GitHub Personal Access Token (classic or fine-grained) with repository pull requests read/write access.">
                              <Info className="size-3.5 text-muted-foreground cursor-help" />
                            </span>
                          </label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                type={showGithubToken ? "text" : "password"}
                                placeholder="ghp_..."
                                value={githubToken}
                                onChange={(e) => setGithubToken(e.target.value)}
                                className="w-full font-mono text-xs bg-muted/10 border-border/60 pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowGithubToken(!showGithubToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showGithubToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                            </div>
                            <Button
                              onClick={() => handleSaveSettings({ github_access_token: githubToken })}
                              size="sm"
                              className="gap-1.5 shrink-0"
                            >
                              Save Token
                            </Button>
                          </div>
                          <div className="text-[11px] text-muted-foreground pt-1.5 space-y-1">
                            <p className="flex items-center gap-1.5 font-medium text-foreground">
                              <ShieldCheck className="size-3.5 text-green-500 shrink-0" />
                              <span>Required Token Permissions:</span>
                            </p>
                            <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                              <li>For <strong>Fine-grained personal access tokens</strong>: Repository permissions for "Pull requests" must be set to <strong>Access: Read and Write</strong> (Metadata is automatically added as Read-only).</li>
                              <li>For <strong>Classic tokens</strong>: Select the <code className="text-foreground bg-muted/40 px-1 py-0.5 rounded font-mono text-[10px]">repo</code> scope check box.</li>
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Setup Guide Stepper Card */}
                    <Card className="border-border/60 bg-card/30 shadow-md">
                      <CardHeader className="border-b border-border/40 pb-5">
                        <div className="flex items-center gap-2.5">
                          <div className="rounded-lg bg-primary/10 p-2 text-primary">
                            <BookOpen className="size-5" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">Setup Onboarding Guide</CardTitle>
                            <CardDescription>
                              Follow these quick steps to register the Webhook on your GitHub repository.
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-8">
                        <div className="relative pl-6 border-l border-border/60 ml-4 space-y-8">
                          {/* Step 1 */}
                          <div className="relative">
                            <div className="absolute -left-[37px] top-0 flex items-center justify-center size-6 rounded-full border border-border bg-background text-[11px] font-bold text-foreground">
                              1
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                                Navigate to Webhook Settings
                              </h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Go to your target repository on GitHub, click on the{" "}
                                <span className="font-medium text-foreground bg-muted/40 px-1 py-0.5 rounded">Settings</span> tab on the top bar, then select{" "}
                                <span className="font-medium text-foreground bg-muted/40 px-1 py-0.5 rounded">Webhooks</span> from the left-hand navigation sidebar.
                              </p>
                            </div>
                          </div>

                          {/* Step 2 */}
                          <div className="relative">
                            <div className="absolute -left-[37px] top-0 flex items-center justify-center size-6 rounded-full border border-border bg-background text-[11px] font-bold text-foreground">
                              2
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm text-foreground">
                                Create Webhook
                              </h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Click on the{" "}
                                <span className="font-medium text-foreground bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">Add webhook</span> button located in the top-right corner of the pane.
                              </p>
                            </div>
                          </div>

                          {/* Step 3 */}
                          <div className="relative">
                            <div className="absolute -left-[37px] top-0 flex items-center justify-center size-6 rounded-full border border-border bg-background text-[11px] font-bold text-foreground">
                              3
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm text-foreground">
                                Input Payload & Secret
                              </h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Paste the **Payload URL** and **Webhook Secret** values copied from the configuration card above into the respective input fields.
                              </p>
                            </div>
                          </div>

                          {/* Step 4 */}
                          <div className="relative">
                            <div className="absolute -left-[37px] top-0 flex items-center justify-center size-6 rounded-full border border-border bg-background text-[11px] font-bold text-foreground">
                              4
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm text-foreground">
                                Adjust Content Type
                              </h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Set the Content type dropdown option to{" "}
                                <code className="text-foreground bg-muted/50 px-1 py-0.5 rounded font-mono text-[11px]">application/json</code>. This is required for BugLens to parse incoming payload events.
                              </p>
                            </div>
                          </div>

                          {/* Step 5 */}
                          <div className="relative">
                            <div className="absolute -left-[37px] top-0 flex items-center justify-center size-6 rounded-full border border-border bg-background text-[11px] font-bold text-foreground">
                              5
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm text-foreground">
                                Select Pull Request Trigger
                              </h4>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Under the event triggers selection, select the{" "}
                                <span className="font-medium text-foreground">Let me select individual events</span> radio option. In the checkboxes list that unfolds, check **ONLY** the **Pull requests** option and uncheck everything else.
                              </p>
                            </div>
                          </div>

                          {/* Step 6 */}
                          <div className="relative">
                            <div className="absolute -left-[37px] top-0 flex items-center justify-center size-6 rounded-full border border-border bg-background text-[11px] font-bold text-foreground">
                              6
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm text-foreground">
                                Activate Webhook
                              </h4>
                              <p className="text-xs text-muted-foreground leading-relaxed flex items-center gap-1.5 flex-wrap">
                                Click the primary{" "}
                                <span className="font-medium text-primary-foreground bg-primary px-1.5 py-0.5 rounded">Add webhook</span> button at the bottom of the form. GitHub will dispatch a ping event to confirm a successful integration.
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}

                {activeTab === "general" && (
                  <Card className="border-border/60 bg-card/30 shadow-md">
                    <CardHeader className="border-b border-border/40 pb-5">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                          <User className="size-5" />
                        </div>
                        <div>
                          <CardTitle className="text-xl">General Configurations</CardTitle>
                          <CardDescription>
                            Manage model provider keys and customize your experience.
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      {/* Account Settings */}
                      <div className="space-y-3 pb-4 border-b border-border/40">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <User className="size-4 text-muted-foreground" />
                          Account Profile
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/30">
                            <span className="text-muted-foreground block mb-0.5">Email</span>
                            <span className="font-medium text-foreground">{user?.email ?? "N/A"}</span>
                          </div>
                          <div className="bg-muted/10 p-3 rounded-lg border border-border/30">
                            <span className="text-muted-foreground block mb-0.5">User ID</span>
                            <span className="font-mono text-foreground font-medium truncate block" title={user?.uid}>
                              {user?.uid ?? "N/A"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* API Keys Configuration */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Key className="size-4 text-muted-foreground" />
                          Custom API Keys (Optional)
                        </h3>
                        
                        {/* OpenAI API Key */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">OpenAI API Key</label>
                          <div className="relative">
                            <Input
                              type={showOpenai ? "text" : "password"}
                              value={openaiKey}
                              onChange={(e) => setOpenaiKey(e.target.value)}
                              className="font-mono text-xs bg-muted/10 border-border/60 pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowOpenai(!showOpenai)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showOpenai ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Gemini API Key */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Gemini API Key</label>
                          <div className="relative">
                            <Input
                              type={showGemini ? "text" : "password"}
                              value={geminiKey}
                              onChange={(e) => setGeminiKey(e.target.value)}
                              className="font-mono text-xs bg-muted/10 border-border/60 pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowGemini(!showGemini)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showGemini ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                          </div>
                        </div>

                        <Button size="sm" className="mt-2 text-xs" onClick={handleSaveGeneralKeys}>
                          Save API Keys
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
