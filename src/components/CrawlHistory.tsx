import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Trash2, Loader2, ExternalLink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type CrawledUrl = {
  url: string;
  source: string;
  created_at: string;
};

type GroupedHistory = {
  domain: string;
  urls: CrawledUrl[];
};

export function CrawlHistory({ refreshKey }: { refreshKey?: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<CrawledUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("crawled_urls")
      .select("url, source, created_at")
      .eq("user_id", user.id)
      .eq("source", "directory-import")
      .order("created_at", { ascending: true });

    if (!error && data) {
      setHistory(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [user, refreshKey]);

  const handleClearAll = async () => {
    if (!user) return;
    setClearing(true);
    const { error } = await supabase
      .from("crawled_urls")
      .delete()
      .eq("user_id", user.id)
      .eq("source", "directory-import");

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setHistory([]);
      toast({ title: "History cleared", description: "All directory import crawl history has been removed. Pages will be re-scraped on next import." });
    }
    setClearing(false);
  };

  const handleClearDomain = async (domain: string, urls: string[]) => {
    if (!user) return;
    // Delete in batches
    for (let i = 0; i < urls.length; i += 100) {
      const batch = urls.slice(i, i + 100);
      await supabase
        .from("crawled_urls")
        .delete()
        .eq("user_id", user.id)
        .eq("source", "directory-import")
        .in("url", batch);
    }
    toast({ title: "Cleared", description: `Removed ${urls.length} crawled URLs for ${domain}.` });
    fetchHistory();
  };

  // Group by domain
  const grouped: GroupedHistory[] = [];
  const domainMap = new Map<string, CrawledUrl[]>();
  for (const entry of history) {
    try {
      const domain = new URL(entry.url).hostname.replace(/^www\./, "");
      if (!domainMap.has(domain)) domainMap.set(domain, []);
      domainMap.get(domain)!.push(entry);
    } catch {
      if (!domainMap.has("other")) domainMap.set("other", []);
      domainMap.get("other")!.push(entry);
    }
  }
  for (const [domain, urls] of domainMap) {
    grouped.push({ domain, urls });
  }
  grouped.sort((a, b) => b.urls.length - a.urls.length);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading crawl history...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Crawl History
          <Badge variant="secondary" className="text-xs">{history.length} URLs</Badge>
        </CardTitle>
        {history.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" disabled={clearing}>
                {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all crawl history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {history.length} tracked URLs. Future imports will re-scrape pages from scratch. This does not delete any imported companies.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAll}>Clear History</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pages have been crawled yet. Run a directory import to start.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(({ domain, urls }) => (
              <details key={domain} className="group">
                <summary className="cursor-pointer flex items-center justify-between text-sm hover:text-foreground text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{domain}</span>
                    <Badge variant="outline" className="text-xs">{urls.length} pages</Badge>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      handleClearDomain(domain, urls.map(u => u.url));
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </summary>
                <ul className="mt-2 space-y-0.5 pl-4 text-xs text-muted-foreground max-h-64 overflow-auto">
                  {urls.map((entry) => {
                    // Highlight page number if present
                    const pageMatch = entry.url.match(/[?&]page=(\d+)/);
                    const pageLabel = pageMatch ? `Page ${pageMatch[1]}` : null;
                    const date = new Date(entry.created_at).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    });
                    return (
                      <li key={entry.url} className="flex items-center justify-between gap-2 py-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {pageLabel && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{pageLabel}</Badge>
                          )}
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline truncate"
                          >
                            {entry.url.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 shrink-0">{date}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
