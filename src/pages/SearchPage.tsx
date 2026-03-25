import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Search, Loader2, ExternalLink, Globe, Sparkles, CheckCircle2, Star, Building2, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { firecrawlApi } from "@/lib/api/firecrawl";
import { supabase } from "@/integrations/supabase/client";
import { useSearchContext } from "@/contexts/SearchContext";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;

export default function SearchPage() {
  const {
    searchTerm, setSearchTerm,
    country, setCountry,
    industry, setIndustry,
    resultLimit, setResultLimit,
    results, setResults,
    searchDone, setSearchDone,
    statusMessage, setStatusMessage,
  } = useSearchContext();
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiFilterEnabled, setAiFilterEnabled] = useState(true);
  const { toast } = useToast();

  const toggleAll = () => {
    if (results.length > 0 && results.every(c => selected.has(c.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map(c => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleShortlist = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const { error } = await supabase.from("companies").update({ status: "Shortlisted" }).in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to shortlist", variant: "destructive" });
      return;
    }
    setResults(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: "Shortlisted" } : c));
    setSelected(new Set());
    toast({ title: "Shortlisted", description: `${ids.length} companies added to shortlist` });
  };

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
        skip_ai_filter: !aiFilterEnabled,
      });

      if (response.success && response.companies) {
        setResults(response.companies);
        const f = response.filtered;
        const filterInfo = f ? ` (filtered ${f.blocklist + f.ai} irrelevant from ${f.raw} raw results)` : '';
        setStatusMessage(`Found ${response.total} companies${filterInfo}`);
        toast({ title: "Search complete", description: `Found ${response.total} relevant companies` });
      } else if (response.upgrade_required) {
        setStatusMessage("");
        toast({ title: "Plan limit reached", description: response.error || "You've reached your monthly limit. Please upgrade your plan to continue.", variant: "destructive" });
      } else {
        setStatusMessage("");
        toast({ title: "Search failed", description: response.error || "Something went wrong", variant: "destructive" });
      }
    } catch {
      setStatusMessage("");
      toast({ title: "Error", description: "Failed to execute search. Please try again.", variant: "destructive" });
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

  const pendingCount = results.filter(c => c.processing_status === 'Pending' && c.website).length;

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Discover Companies</h1>
        <p className="text-muted-foreground text-[13px] mt-0.5">
          Search the web for companies matching your criteria
        </p>
      </div>

      {/* Search Form */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-5">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="search" className="text-[13px] font-medium">Search term</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="search"
                  placeholder='e.g. "CNC workholding supplier USA"'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-[13px] bg-muted/30 border-border/60 focus:bg-background transition-colors"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium">Country / Region</Label>
                <Input
                  placeholder="e.g. USA, Germany"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="h-9 text-[13px] bg-muted/30 border-border/60 focus:bg-background transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium">Industry focus</Label>
                <Input
                  placeholder="e.g. Manufacturing"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="h-9 text-[13px] bg-muted/30 border-border/60 focus:bg-background transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium">Result limit</Label>
                <Select value={resultLimit} onValueChange={setResultLimit}>
                  <SelectTrigger className="h-9 text-[13px] bg-muted/30 border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25" className="text-[13px]">25 results</SelectItem>
                    <SelectItem value="50" className="text-[13px]">50 results</SelectItem>
                    <SelectItem value="100" className="text-[13px]">100 results</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button type="submit" disabled={loading || !searchTerm.trim()} size="sm" className="h-9 px-4 text-[13px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-3.5 w-3.5" />
                  Search Companies
                </>
              )}
              </Button>
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground/60" />
                <Label htmlFor="ai-filter" className="text-[12px] text-muted-foreground cursor-pointer">AI relevance filter</Label>
                <Switch id="ai-filter" checked={aiFilterEnabled} onCheckedChange={setAiFilterEnabled} className="scale-90" />
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Loading indicator */}
      {loading && (
        <Card className="border-border/60">
          <CardContent className="py-5 px-5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium">{statusMessage}</p>
                <Progress className="mt-2 h-1.5 bg-muted/50" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 border-b border-border/60 bg-primary/5 px-4 py-2.5">
              <span className="text-[13px] font-medium text-primary">{selected.size} selected</span>
              <div className="h-3.5 w-px bg-border" />
              <Button size="sm" variant="outline" onClick={handleShortlist} className="h-7 text-[12px] px-2.5">
                <Star className="mr-1.5 h-3 w-3" />
                Shortlist
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto h-7 text-[12px] px-2.5 text-muted-foreground">
                Clear
              </Button>
            </div>
          )}
          <CardHeader className="flex flex-row items-center justify-between py-3.5 px-5">
            <CardTitle className="text-[13px] font-semibold tracking-normal">
              Results · {results.length} companies
            </CardTitle>
            {pendingCount > 0 && (
              <Button size="sm" variant="outline" onClick={handleAnalyzeAll} disabled={analyzing.size > 0} className="h-7 text-[12px] px-2.5 border-border/60">
                <Sparkles className="mr-1.5 h-3 w-3" />
                Analyze All ({pendingCount})
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-10 pl-5">
                    <Checkbox
                      checked={results.length > 0 && results.every(c => selected.has(c.id))}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Company</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Domain</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Status</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Processing</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Confidence</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((company) => (
                  <TableRow key={company.id} className="group" data-state={selected.has(company.id) ? "selected" : undefined}>
                    <TableCell className="pl-5">
                      <Checkbox
                        checked={selected.has(company.id)}
                        onCheckedChange={() => toggleOne(company.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-[13px] font-medium text-foreground">{company.name}</span>
                        {company.summary && (
                          <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1 max-w-[300px]">{company.summary}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-muted-foreground text-[13px]">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground/50" />
                        {company.domain || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColor(company.status)} className="text-[11px] font-medium px-2 py-0">
                        {company.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {analyzing.has(company.id) ? (
                        <span className="flex items-center gap-1.5 text-[12px] text-warning">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Analyzing
                        </span>
                      ) : company.processing_status === 'Completed' ? (
                        <span className="flex items-center gap-1.5 text-[12px] text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          Completed
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">
                          {company.processing_status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-[13px] tabular-nums text-muted-foreground">
                        {company.confidence_score ? `${Math.round(Number(company.confidence_score) * 100)}%` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {company.processing_status === 'Pending' && company.website && !analyzing.has(company.id) && (
                          <Button size="sm" variant="ghost" onClick={() => handleAnalyze(company)} title="Analyze" className="h-7 w-7 p-0">
                            <Sparkles className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </Button>
                        )}
                        {company.website && (
                          <a
                            href={company.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
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

      {/* Empty states */}
      {!loading && searchDone && results.length === 0 && (
        <Card className="border-border/60 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center mb-3">
              <Search className="h-4.5 w-4.5 text-muted-foreground/50" />
            </div>
            <p className="text-[13px] text-muted-foreground">
              No companies found. Try a different search term.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !searchDone && results.length === 0 && (
        <Card className="border-border/60 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center mb-3">
              <Building2 className="h-4.5 w-4.5 text-muted-foreground/50" />
            </div>
            <p className="text-[13px] font-medium text-foreground/80">Ready to discover</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Enter a search term above to find companies
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
