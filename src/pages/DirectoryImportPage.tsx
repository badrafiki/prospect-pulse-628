import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FolderDown, Globe, Loader2, CheckCircle2, AlertCircle, Building2, Mail, FileSearch, Phone } from "lucide-react";
import { ImportDiagnostics, type ImportDiagnosticsData } from "@/components/ImportDiagnostics";

type ImportResult = {
  success: boolean;
  error?: string;
  pages_crawled?: number;
  companies_extracted?: number;
  companies_imported?: number;
  emails_found?: number;
  phones_found?: number;
  duplicates_skipped?: number;
};

export default function DirectoryImportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(100);
  const [includePath, setIncludePath] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!url.trim()) {
      toast({ title: "URL required", description: "Please enter a directory URL to import from.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setResult(null);
    setStatus("Starting crawl... This may take a few minutes depending on the directory size.");

    try {
      const { data, error } = await supabase.functions.invoke("scrape-directory", {
        body: {
          url: url.trim(),
          max_pages: maxPages,
          include_path: includePath.trim() || undefined,
          user_id: user?.id,
        },
      });

      if (error) {
        setResult({ success: false, error: error.message });
        toast({ title: "Import failed", description: error.message, variant: "destructive" });
      } else if (data?.success) {
        setResult(data);
        toast({
          title: "Import complete!",
          description: `${data.companies_imported} companies and ${data.emails_found} emails imported.`,
        });
      } else {
        setResult({ success: false, error: data?.error || "Unknown error" });
        toast({ title: "Import failed", description: data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message });
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
      setStatus("");
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Directory Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crawl a business directory and automatically extract companies, contacts, and emails.
        </p>
      </div>

      {/* Import Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Directory URL
          </CardTitle>
          <CardDescription>
            Paste the URL of a business directory listing page. The crawler will visit each company detail page and extract structured data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Directory URL</Label>
            <Input
              id="url"
              placeholder="https://machinist.com/shop-finder"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isImporting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxPages">Max Pages to Crawl</Label>
              <Input
                id="maxPages"
                type="number"
                min={10}
                max={500}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                disabled={isImporting}
              />
              <p className="text-xs text-muted-foreground">10–500 pages. More pages = longer crawl time.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="includePath">URL Path Filter (optional)</Label>
              <Input
                id="includePath"
                placeholder="/machine-shops/"
                value={includePath}
                onChange={(e) => setIncludePath(e.target.value)}
                disabled={isImporting}
              />
              <p className="text-xs text-muted-foreground">Only crawl URLs containing this path.</p>
            </div>
          </div>

          <Button onClick={handleImport} disabled={isImporting} className="w-full">
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Crawling & Importing...
              </>
            ) : (
              <>
                <FolderDown className="h-4 w-4" />
                Start Import
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Progress */}
      {isImporting && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {status}
              </div>
              <Progress value={undefined} className="h-2" />
              <p className="text-xs text-muted-foreground">
                The crawler is visiting pages, extracting data with AI, and importing companies. This can take 2–5 minutes for large directories.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card className={result.success ? "border-green-500/30" : "border-destructive/30"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              {result.success ? "Import Complete" : "Import Failed"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.success ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileSearch className="h-3.5 w-3.5" />
                    Pages Crawled
                  </div>
                  <p className="text-2xl font-bold text-foreground">{result.pages_crawled}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Companies
                  </div>
                  <p className="text-2xl font-bold text-foreground">{result.companies_imported}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    Emails
                  </div>
                  <p className="text-2xl font-bold text-foreground">{result.emails_found}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    Phones
                  </div>
                  <p className="text-2xl font-bold text-foreground">{result.phones_found || 0}</p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Duplicates Skipped</div>
                  <p className="text-2xl font-bold text-muted-foreground">{result.duplicates_skipped}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-destructive">{result.error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Use the <Badge variant="secondary" className="text-xs">URL Path Filter</Badge> to target specific listing pages (e.g. <code>/machine-shops/</code> for machinist.com).</p>
          <p>• Start with a smaller max pages (50–100) to test before doing a full crawl.</p>
          <p>• Duplicate companies (by domain) are automatically skipped.</p>
          <p>• After importing, use the <strong>Discover</strong> page to enrich companies with additional emails and contacts.</p>
        </CardContent>
      </Card>
    </div>
  );
}
