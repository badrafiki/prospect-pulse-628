import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Mail, Lock, User, ArrowRight, Globe, Users, Zap } from "lucide-react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: "Check your email",
          description: "We sent you a confirmation link to verify your account.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Globe, title: "Discover Companies", desc: "AI-powered search across the web to find your ideal prospects" },
    { icon: Users, title: "Find Decision Makers", desc: "Automatically discover key contacts and their roles" },
    { icon: Zap, title: "Export & Connect", desc: "One-click export to Mailchimp and other marketing tools" },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Left — Branding panel */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-sidebar text-sidebar-foreground">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--sidebar-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--sidebar-foreground)) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        {/* Gradient glow */}
        <div
          className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Search className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-sidebar-accent-foreground tracking-tight">
              LeadScope
            </span>
          </div>

          {/* Hero copy */}
          <div className="space-y-8 max-w-lg">
            <h1 className="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight text-sidebar-accent-foreground">
              Your unfair
              <br />
              advantage in
              <br />
              <span className="text-primary">lead discovery.</span>
            </h1>
            <p className="text-[15px] leading-relaxed text-sidebar-foreground max-w-sm">
              Find, qualify, and connect with companies at scale — powered by
              AI-driven web crawling and smart relevance filtering.
            </p>

            {/* Feature list */}
            <div className="space-y-5 pt-2">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                    <f.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-sidebar-accent-foreground">
                      {f.title}
                    </p>
                    <p className="text-[12px] leading-relaxed text-sidebar-foreground mt-0.5">
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <p className="text-[11px] text-sidebar-foreground/60">
            © {new Date().getFullYear()} LeadScope · Privacy · Terms
          </p>
        </div>
      </div>

      {/* Right — Form panel */}
      <div className="flex w-full lg:w-[45%] items-center justify-center bg-background p-6 sm:p-12">
        <div className="w-full max-w-[400px] space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Search className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              LeadScope
            </span>
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {isLogin ? "Welcome back" : "Get started"}
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {isLogin
                ? "Sign in to your account to continue"
                : "Create your account to start discovering leads"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[13px]">
                  Display name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-9 h-11 text-[13px]"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px]">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-9 h-11 text-[13px]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px]">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-9 h-11 text-[13px]"
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 text-[13px] gap-2" disabled={loading}>
              {loading ? "Please wait..." : isLogin ? "Sign in" : "Create account"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="text-center text-[13px] text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="font-medium text-primary hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/60 lg:hidden">
            Use responsibly and comply with GDPR, CAN-SPAM, and local marketing laws.
          </p>
        </div>
      </div>
    </div>
  );
}
