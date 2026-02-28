import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Search, ExternalLink, Globe, Filter, Mail, Loader2, ChevronDown, ChevronRight, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Company = Tables<"companies">;
type Email = Tables<"emails">;

const STATUSES = ["New", "Shortlisted", "Contacted", "Not a fit"] as const;

const statusColors: Record<string, string> = {
  New: "bg-secondary text-secondary-foreground",
  Shortlisted: "bg-primary/10 text-primary",
  Contacted: "bg-success/10 text-success",
  "Not a fit": "bg-destructive/10 text-destructive",
};

const contextColors: Record<string, string> = {
  Sales: "bg-primary/10 text-primary",
  Support: "bg-accent text-accent-foreground",
  General: "bg-secondary text-secondary-foreground",
  Careers: "bg-muted text-muted-foreground",
  Legal: "bg-destructive/10 text-destructive",
  Management: "bg-primary/20 text-primary",
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [emailsByCompany, setEmailsByCompany] = useState<Record<string, Email[]>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [findingEmails, setFindingEmails] = useState(false);
  const [findingPeople, setFindingPeople] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [emailFilter, setEmailFilter] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    const [companiesRes, emailsRes] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.from("emails").select("*"),
    ]);
    setCompanies(companiesRes.data ?? []);
    const grouped: Record<string, Email[]> = {};
    for (const e of emailsRes.data ?? []) {
      (grouped[e.company_id] ??= []).push(e);
    }
    setEmailsByCompany(grouped);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (emailFilter && !(emailsByCompany[c.id]?.length > 0)) return false;
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
  }, [companies, statusFilter, searchFilter, emailFilter, emailsByCompany]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkStatus = async (newStatus: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const { error } = await supabase.from("companies").update({ status: newStatus }).in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
      return;
    }
    setCompanies((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, status: newStatus } : c)));
    setSelected(new Set());
    toast({ title: "Updated", description: `${ids.length} companies set to ${newStatus}` });
  };

  const handleFindEmails = async () => {
    const ids = Array.from(selected);
    setFindingEmails(true);
    setProgressCurrent(0);
    setProgressTotal(ids.length);
    let found = 0;
    for (let i = 0; i < ids.length; i++) {
      const company = companies.find(c => c.id === ids[i]);
      setProgressText(`Finding emails for ${company?.name || 'company'}... (${i + 1}/${ids.length})`);
      setProgressCurrent(i + 1);
      try {
        const { data, error } = await supabase.functions.invoke('discover-emails', {
          body: { company_id: ids[i] },
        });
        if (!error && data?.emails_found) found += data.emails_found;
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    setFindingEmails(false);
    setProgressText("");
    setSelected(new Set());
    await fetchData();
    toast({ title: "Email discovery complete", description: `Found ${found} new emails across ${ids.length} companies` });
  };

  const handleFindPeople = async () => {
    const ids = Array.from(selected);
    setFindingPeople(true);
    setProgressCurrent(0);
    setProgressTotal(ids.length);
    let found = 0;
    for (let i = 0; i < ids.length; i++) {
      const company = companies.find(c => c.id === ids[i]);
      setProgressText(`Finding people for ${company?.name || 'company'}... (${i + 1}/${ids.length})`);
      setProgressCurrent(i + 1);
      try {
        const { data, error } = await supabase.functions.invoke('discover-people', {
          body: { company_id: ids[i] },
        });
        if (!error && data?.people_found) found += data.people_found;
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    setFindingPeople(false);
    setProgressText("");
    setSelected(new Set());
    toast({ title: "People discovery complete", description: `Found ${found} new contacts across ${ids.length} companies` });
  };

  const handleInlineStatus = async (company: Company, newStatus: string) => {
    const { error } = await supabase.from("companies").update({ status: newStatus }).eq("id", company.id);
    if (!error) {
      setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, status: newStatus } : c)));
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
          <Input placeholder="Filter by name, domain, industry..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={emailFilter ? "default" : "outline"}
          onClick={() => setEmailFilter(!emailFilter)}
        >
          <Mail className="mr-2 h-4 w-4" />
          Has Emails
        </Button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="h-4 w-px bg-border" />
          {STATUSES.map((s) => (
            <Button key={s} size="sm" variant="outline" onClick={() => handleBulkStatus(s)}>{s}</Button>
          ))}
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={handleFindEmails} disabled={findingEmails || findingPeople}>
            {findingEmails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Find Emails
          </Button>
          <Button size="sm" variant="outline" onClick={handleFindPeople} disabled={findingPeople || findingEmails}>
            {findingPeople ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            Find People
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">Clear</Button>
        </div>
      )}

      {/* Progress bar */}
      {(findingEmails || findingPeople) && progressText && (
        <div className="space-y-2 rounded-lg border bg-muted/50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{progressText}</span>
            <span className="font-medium">{Math.round((progressCurrent / progressTotal) * 100)}%</span>
          </div>
          <Progress value={(progressCurrent / progressTotal) * 100} className="h-2" />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {companies.length === 0 ? "No companies yet. Run a search to discover companies." : "No companies match your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Emails</TableHead>
                <TableHead>Industries</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const emails = emailsByCompany[c.id] || [];
                const isExpanded = expanded.has(c.id);
                return (
                  <>
                    <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                      </TableCell>
                      <TableCell className="px-1">
                        {emails.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(c.id)}>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{c.name}</span>
                          {c.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.summary}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                          <Globe className="h-3.5 w-3.5" />{c.domain || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select value={c.status} onValueChange={(v) => handleInlineStatus(c, v)}>
                          <SelectTrigger className="h-7 w-28 border-none shadow-none px-0">
                            <Badge variant="secondary" className={statusColors[c.status] || ""}>{c.status}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {emails.length > 0 ? (
                          <Badge variant="secondary" className="bg-primary/10 text-primary cursor-pointer" onClick={() => toggleExpand(c.id)}>
                            <Mail className="h-3 w-3 mr-1" />{emails.length}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.industries?.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{c.confidence_score ? `${Math.round(c.confidence_score * 100)}%` : "—"}</TableCell>
                      <TableCell>
                        {c.website && (
                          <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && emails.length > 0 && (
                      <TableRow key={`${c.id}-emails`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={9} className="py-2 px-4">
                          <div className="pl-12 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Discovered Emails</p>
                            <div className="grid gap-1.5">
                              {emails.map((e) => (
                                <div key={e.id} className="flex items-center gap-3 text-sm">
                                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                  <a href={`mailto:${e.email_address}`} className="text-primary hover:underline font-medium">
                                    {e.email_address}
                                  </a>
                                  <Badge variant="outline" className={`text-xs ${contextColors[e.context || "General"] || ""}`}>
                                    {e.context || "General"}
                                  </Badge>
                                  {e.source_url && (
                                    <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline truncate max-w-[200px]">
                                      {new URL(e.source_url).pathname}
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
