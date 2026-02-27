import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, ExternalLink, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { firecrawlApi } from "@/lib/api/firecrawl";
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
  const { toast } = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setLoading(true);
    setResults([]);
    setSearchDone(false);

    try {
      const response = await firecrawlApi.search({
        query: searchTerm.trim(),
        country: country.trim() || undefined,
        industry: industry.trim() || undefined,
        limit: parseInt(resultLimit),
      });

      if (response.success && response.companies) {
        setResults(response.companies);
        toast({
          title: "Search complete",
          description: `Found ${response.total} companies`,
        });
      } else {
        toast({
          title: "Search failed",
          description: response.error || "Something went wrong",
          variant: "destructive",
        });
      }
    } catch (err) {
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

      {results.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Results ({results.length} companies)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Processing</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">{company.name}</TableCell>
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
                      <span className={`text-sm font-medium ${processingColor(company.processing_status)}`}>
                        {company.processing_status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {company.website && (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchDone
                ? "No companies found. Try a different search term."
                : "Enter a search term above to discover companies"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
