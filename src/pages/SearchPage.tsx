import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Search, Loader2, ExternalLink, Globe, Sparkles, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { firecrawlApi } from "@/lib/api/firecrawl";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [resultLimit, setResultLimit] = useState("25");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Company[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState("");
  const { toast } = useToast();

  const handleAnalyze = useCallback(async (company: Company) => {
    if (!company.website) return;
    setAnalyzing(prev => new Set(prev).add(company.id));

    try {
      const { data, error } = await supabase.functions.invoke('analyze-company', {
        body: { company_id: company.id, url: company.website },
      });

      if (error) throw error;

      if (data?.success) {
        setResults(prev => prev.map(c =>
          c.id === company.id ? { ...c, ...data.company } : c
        ));
        toast({ title: "Analysis complete", description: `${company.name} has been enriched` });
      }
    } catch {
      toast({ title: "Analysis failed", description: `Could not analyze ${company.name}`, variant: "destructive" });
    } finally {
      setAnalyzing(prev => { const s = new Set(prev); s.delete(company.id); return s; });
    }
  }, [toast]);

  const handleAnalyzeAll = useCallback(async () => {
    const pending = results.filter(c => c.processing_status === 'Pending' && c.website);
    for (const company of pending) {
      await handleAnalyze(company);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
  }, [results, handleAnalyze]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true);
    setResults([]);
    setSearchDone(false);
    setStatusMessage("Searching the web...");

    try {
      const response = await firecrawlApi.search({
        query: searchTerm.trim(),
        country: country.trim() || undefined,
        industry: industry.trim() || undefined,
        limit: parseInt(resultLimit),
      });

      if (response.success && response.companies) {
        setResults(response.companies);
        setStatusMessage(`Found ${response.total} companies`);
        toast({
          title: "Search complete",
          description: `Found ${response.total} companies`,
        });
      } else {
        setStatusMessage("");
        toast({
          title: "Search failed",
          description: response.error || "Something went wrong",
          variant: "destructive",
        });
      }
    } catch {
      setStatusMessage("");
      toast({
        title: "Error",
        description: "Failed to execute search. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setSearchDone(true);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "New": return "secondary";
      case "Shortlisted": return "default";
      case "Contacted": return "outline";
      default: return "secondary";
    }
  };

  const processingColor = (status: string) => {
    switch (status) {
      case "Completed": return "text-success";
      case "Processing": return "text-warning";
      case "Error": return "text-destructive";
      default: return "text-muted-foreground";
    }
  };

  const pendingCount = results.filter(c => c.processing_status === 'Pending' && c.website).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Discover Companies</h1>
        <p className="text-muted-foreground text-sm">
          Search the web for companies matching your criteria
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search term</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder='e.g. "CNC workholding supplier USA"'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Country / Region</Label>
                <Input
                  placeholder="e.g. USA, Germany"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Industry focus</Label>
                <Input
                  placeholder="e.g. Manufacturing"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Result limit</Label>
                <Select value={resultLimit} onValueChange={setResultLimit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 results</SelectItem>
                    <SelectItem value="50">50 results</SelectItem>
                    <SelectItem value="100">100 results</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" disabled={loading || !searchTerm.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search Companies
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Loading / status indicator */}
      {loading && (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{statusMessage}</p>
                <Progress className="mt-2 h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Results ({results.length} companies)
            </CardTitle>
            {pendingCount > 0 && (
              <Button size="sm" variant="outline" onClick={handleAnalyzeAll} disabled={analyzing.size > 0}>
                <Sparkles className="mr-2 h-4 w-4" />
                Analyze All ({pendingCount})
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Processing</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{company.name}</span>
                        {company.summary && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{company.summary}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                        <Globe className="h-3.5 w-3.5" />
                        {company.domain || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColor(company.status)}>
                        {company.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {analyzing.has(company.id) ? (
                        <span className="flex items-center gap-1.5 text-sm text-warning">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Analyzing...
                        </span>
                      ) : company.processing_status === 'Completed' ? (
                        <span className="flex items-center gap-1.5 text-sm text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Completed
                        </span>
                      ) : (
                        <span className={`text-sm font-medium ${processingColor(company.processing_status)}`}>
                          {company.processing_status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {company.confidence_score ? `${Math.round(Number(company.confidence_score) * 100)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {company.processing_status === 'Pending' && company.website && !analyzing.has(company.id) && (
                          <Button size="sm" variant="ghost" onClick={() => handleAnalyze(company)} title="Analyze">
                            <Sparkles className="h-4 w-4" />
                          </Button>
                        )}
                        {company.website && (
                          <a
                            href={company.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground p-1"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!loading && searchDone && results.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No companies found. Try a different search term.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !searchDone && results.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Enter a search term above to discover companies
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
