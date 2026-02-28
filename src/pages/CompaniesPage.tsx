import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Search, ExternalLink, Globe, CheckCircle2, Filter, Mail, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Company = Tables<"companies">;

const STATUSES = ["New", "Shortlisted", "Contacted", "Not a fit"] as const;

const statusColors: Record<string, string> = {
  New: "bg-secondary text-secondary-foreground",
  Shortlisted: "bg-primary/10 text-primary",
  Contacted: "bg-success/10 text-success",
  "Not a fit": "bg-destructive/10 text-destructive",
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setCompanies(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.domain?.toLowerCase().includes(q) ||
          c.industries?.some((i) => i.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [companies, statusFilter, searchFilter]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkStatus = async (newStatus: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from("companies")
      .update({ status: newStatus })
      .in("id", ids);

    if (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
      return;
    }

    setCompanies((prev) =>
      prev.map((c) => (ids.includes(c.id) ? { ...c, status: newStatus } : c))
    );
    setSelected(new Set());
    toast({ title: "Updated", description: `${ids.length} companies set to ${newStatus}` });
  };

  const [findingEmails, setFindingEmails] = useState(false);

  const handleFindEmails = async () => {
    const ids = Array.from(selected);
    setFindingEmails(true);
    let found = 0;
    for (const id of ids) {
      try {
        const { data, error } = await supabase.functions.invoke('discover-emails', {
          body: { company_id: id },
        });
        if (!error && data?.emails_found) found += data.emails_found;
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    setFindingEmails(false);
    setSelected(new Set());
    toast({ title: "Email discovery complete", description: `Found ${found} new emails across ${ids.length} companies` });
  };

  const handleInlineStatus = async (company: Company, newStatus: string) => {
    const { error } = await supabase
      .from("companies")
      .update({ status: newStatus })
      .eq("id", company.id);

    if (!error) {
      setCompanies((prev) =>
        prev.map((c) => (c.id === company.id ? { ...c, status: newStatus } : c))
      );
    }
  };

  if (loading) {
    return <div className="p-6"><p className="text-muted-foreground text-sm">Loading companies...</p></div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
        <p className="text-muted-foreground text-sm">{companies.length} companies in your CRM</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by name, domain, industry..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="h-4 w-px bg-border" />
          {STATUSES.map((s) => (
            <Button key={s} size="sm" variant="outline" onClick={() => handleBulkStatus(s)}>
              {s}
            </Button>
          ))}
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={handleFindEmails} disabled={findingEmails}>
            {findingEmails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Find Emails
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
            Clear
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {companies.length === 0
                ? "No companies yet. Run a search to discover companies."
                : "No companies match your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Industries</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggleOne(c.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{c.name}</span>
                      {c.summary && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.summary}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                      <Globe className="h-3.5 w-3.5" />
                      {c.domain || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Select value={c.status} onValueChange={(v) => handleInlineStatus(c, v)}>
                      <SelectTrigger className="h-7 w-28 border-none shadow-none px-0">
                        <Badge variant="secondary" className={statusColors[c.status] || ""}>
                          {c.status}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.industries?.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.confidence_score ? `${Math.round(c.confidence_score * 100)}%` : "—"}
                  </TableCell>
                  <TableCell>
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
