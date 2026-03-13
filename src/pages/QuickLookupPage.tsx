import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Mail, Loader2, ExternalLink, Search, Copy, CheckCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type FoundEmail = {
  email_address: string;
  context: string | null;
  source_url: string | null;
};

export default function QuickLookupPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState<FoundEmail[]>([]);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [searched, setSearched] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const normalizeDomain = (input: string) => {
    let d = input.trim().replace(/\/+$/, "");
    d = d.replace(/^https?:\/\//i, "");
    d = d.replace(/\/.*$/, "");
    return d;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !domain.trim()) return;

    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain) return;

    setLoading(true);
    setEmails([]);
    setDiagnostics(null);
    setSearched(true);

    try {
      // Find or create a company for this domain
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .eq("domain", cleanDomain)
        .maybeSingle();

      let companyId = existing?.id;

      if (!companyId) {
        const { data: created, error: createErr } = await supabase
          .from("companies")
          .insert({
            user_id: user.id,
            name: cleanDomain,
            domain: cleanDomain,
            website: `https://${cleanDomain}`,
            status: "new",
            processing_status: "pending",
            source_search_term: "quick-lookup",
          })
          .select("id")
          .single();

        if (createErr || !created) {
          toast({ title: "Error", description: "Failed to create company record", variant: "destructive" });
          setLoading(false);
          return;
        }
        companyId = created.id;
      }

      // Run email discovery
      const { data, error } = await supabase.functions.invoke("discover-emails", {
        body: { company_id: companyId, fast_mode: false },
      });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      if (data?.diagnostics) setDiagnostics(data.diagnostics);

      // Fetch all emails for this company
      const { data: emailRows } = await supabase
        .from("emails")
        .select("email_address, context, source_url")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      setEmails(emailRows ?? []);

      if ((emailRows?.length ?? 0) === 0) {
        toast({ title: "No emails found", description: `No email addresses were discovered on ${cleanDomain}` });
      } else {
        toast({ title: "Done", description: `Found ${emailRows!.length} email(s) on ${cleanDomain}` });
      }
    } catch (err) {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyEmail = (email: string, idx: number) => {
    navigator.clipboard.writeText(email);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const copyAll = () => {
    const all = emails.map((e) => e.email_address).join("\n");
    navigator.clipboard.writeText(all);
    toast({ title: "Copied", description: `${emails.length} email(s) copied to clipboard` });
  };

  const contextColor = (ctx: string | null) => {
    switch (ctx) {
      case "Sales": return "default";
      case "Support": return "secondary";
      case "Management": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quick Lookup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a domain and instantly find email addresses on the website.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                className="pl-9"
                disabled={loading}
              />
            </div>
            <Button type="submit" disabled={loading || !domain.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              {loading ? "Scanning..." : "Find Emails"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-sm font-medium">Crawling website and extracting emails...</p>
            <p className="text-xs mt-1">This may take 15–30 seconds</p>
          </CardContent>
        </Card>
      )}

      {!loading && searched && emails.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">
                <Mail className="inline h-4 w-4 mr-1.5 -mt-0.5" />
                {emails.length} Email{emails.length !== 1 ? "s" : ""} Found
              </CardTitle>
              {diagnostics && (
                <CardDescription className="text-xs mt-1">
                  {diagnostics.pages_scraped} pages scraped · {diagnostics.mode}
                </CardDescription>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={copyAll}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy All
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {emails.map((e, i) => (
              <div
                key={e.email_address}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium truncate">{e.email_address}</span>
                  <Badge variant={contextColor(e.context)} className="text-[10px] shrink-0">
                    {e.context || "General"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {e.source_url && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <a href={e.source_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyEmail(e.email_address, i)}>
                    {copiedIdx === i ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && searched && emails.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No emails found</p>
            <p className="text-xs mt-1">Try a different domain or check that the website is publicly accessible.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
