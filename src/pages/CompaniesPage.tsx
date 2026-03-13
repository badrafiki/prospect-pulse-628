import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabaseHelpers";
import { Progress } from "@/components/ui/progress";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building2, Search, ExternalLink, Globe, Filter, Mail, Loader2, ChevronDown, ChevronRight, ChevronLeft, Users, Archive, Zap, Trash2, Upload, Phone, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CrawlerSettingsDialog, DEFAULT_SETTINGS, type CrawlerSettings } from "@/components/CrawlerSettingsDialog";
import { DiscoveryDiagnostics, type DiagnosticsData } from "@/components/DiscoveryDiagnostics";

type Company = Tables<"companies">;
type Email = Tables<"emails">;
type Person = Tables<"people">;

const STATUSES = ["New", "Shortlisted", "Contacted", "Not a fit", "Archived"] as const;

const statusColors: Record<string, string> = {
  New: "bg-secondary text-secondary-foreground",
  Shortlisted: "bg-primary/10 text-primary",
  Contacted: "bg-success/10 text-success",
  "Not a fit": "bg-destructive/10 text-destructive",
  Archived: "bg-muted text-muted-foreground",
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
  const [peopleByCompany, setPeopleByCompany] = useState<Record<string, Person[]>>({});
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
  const [fastMode, setFastMode] = useState(true);
  const [emailFilter, setEmailFilter] = useState<"all" | "has" | "none">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [crawlerSettings, setCrawlerSettings] = useState<CrawlerSettings>(DEFAULT_SETTINGS);
  const [lastDiagnostics, setLastDiagnostics] = useState<Record<string, DiagnosticsData>>({});
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;
  const { toast } = useToast();
  const location = useLocation();

  const fetchData = async () => {
    const [companiesData, emailsData, peopleData] = await Promise.all([
      fetchAllRows<Company>("companies", { order: { column: "created_at", ascending: false } }),
      fetchAllRows<Email>("emails"),
      fetchAllRows<Person>("people"),
    ]);
    setCompanies(companiesData);
    const groupedEmails: Record<string, Email[]> = {};
    for (const e of emailsData) {
      (groupedEmails[e.company_id] ??= []).push(e);
    }
    setEmailsByCompany(groupedEmails);
    const groupedPeople: Record<string, Person[]> = {};
    for (const p of peopleData) {
      (groupedPeople[p.company_id] ??= []).push(p);
    }
    setPeopleByCompany(groupedPeople);
    setLoading(false);
  };

  // Refetch on every navigation + realtime subscriptions
  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('companies-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [location.key]);

  const filtered = useMemo(() => {
    setCurrentPage(1);
    return companies.filter((c) => {
      if (!showArchived && c.status === "Archived") return false;
      if (emailFilter === "has" && !(emailsByCompany[c.id]?.length > 0)) return false;
      if (emailFilter === "none" && (emailsByCompany[c.id]?.length > 0)) return false;
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
  }, [companies, statusFilter, searchFilter, emailFilter, emailsByCompany, showArchived]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedFiltered = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const allSelected = paginatedFiltered.length > 0 && paginatedFiltered.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(paginatedFiltered.map((c) => c.id)));
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

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setDeleting(true);
    const { error } = await supabase.from("companies").delete().in("id", ids);
    setDeleting(false);
    if (error) {
      toast({ title: "Error", description: "Failed to delete companies", variant: "destructive" });
      return;
    }
    setCompanies((prev) => prev.filter((c) => !ids.includes(c.id)));
    setEmailsByCompany((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    setPeopleByCompany((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    setSelected(new Set());
    toast({ title: "Deleted", description: `${ids.length} companies and all related data removed` });
  };

  const handleFindEmails = async () => {
    const ids = Array.from(selected);
    setFindingEmails(true);
    setProgressCurrent(0);
    setProgressTotal(ids.length);
    let found = 0;
    for (let i = 0; i < ids.length; i++) {
      const company = companies.find(c => c.id === ids[i]);
      if (!company?.website) {
        console.log(`Skipping ${company?.name || 'company'} — no website`);
        setProgressCurrent(i + 1);
        continue;
      }
      setProgressText(`Finding emails for ${company?.name || 'company'}... (${i + 1}/${ids.length})`);
      setProgressCurrent(i + 1);
      try {
        const { data, error } = await supabase.functions.invoke('discover-emails', {
          body: {
            company_id: ids[i],
            fast_mode: fastMode,
            crawler_settings: {
              max_pages: crawlerSettings.maxPages,
              sitemap_depth: crawlerSettings.sitemapDepth,
              include_paths: crawlerSettings.includePaths,
              exclude_paths: crawlerSettings.excludePaths,
            },
          },
        });
        if (!error && data?.emails_found) found += data.emails_found;
        if (data?.diagnostics) {
          setLastDiagnostics(prev => ({ ...prev, [ids[i]]: data.diagnostics }));
        }
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
    await fetchData();
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
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
        <p className="text-muted-foreground text-[13px] mt-1">{companies.length} companies in your CRM</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter by name, domain, industry..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="pl-9 h-9 text-[13px]" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9 text-[13px]">
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant={emailFilter === "has" ? "default" : "outline"} onClick={() => setEmailFilter(emailFilter === "has" ? "all" : "has")} className="h-9 text-[13px]">
          <Mail className="mr-1.5 h-3.5 w-3.5" />Has Emails
        </Button>
        <Button size="sm" variant={emailFilter === "none" ? "default" : "outline"} onClick={() => setEmailFilter(emailFilter === "none" ? "all" : "none")} className="h-9 text-[13px]">
          <Mail className="mr-1.5 h-3.5 w-3.5" />No Emails
        </Button>
        <Button size="sm" variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived(!showArchived)} className="h-9 text-[13px]">
          <Archive className="mr-1.5 h-3.5 w-3.5" />{showArchived ? "Showing Archived" : "Show Archived"}
        </Button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 flex-wrap">
          <span className="text-[13px] font-semibold tabular-nums">{selected.size} selected</span>
          <div className="h-4 w-px bg-border" />
          {STATUSES.filter(s => s !== "Archived").map((s) => (
            <Button key={s} size="sm" variant="outline" onClick={() => handleBulkStatus(s)} className="h-8 text-[12px]">{s}</Button>
          ))}
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={() => handleBulkStatus("Archived")} className="h-8 text-[12px] text-muted-foreground">
            <Archive className="mr-1.5 h-3.5 w-3.5" />Archive
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-[12px] text-destructive border-destructive/30 hover:bg-destructive/10" disabled={deleting}>
                {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selected.size} companies?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the selected companies and all their associated emails and people. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={handleFindEmails} disabled={findingEmails || findingPeople} className="h-8 text-[12px]">
            {findingEmails ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
            Find Emails
          </Button>
          <div className="flex items-center gap-1.5">
            <Switch id="fast-mode" checked={fastMode} onCheckedChange={setFastMode} className="scale-75" />
            <Label htmlFor="fast-mode" className="text-[11px] cursor-pointer flex items-center gap-1">
              <Zap className="h-3 w-3 text-warning" />Fast
            </Label>
          </div>
          <CrawlerSettingsDialog settings={crawlerSettings} onSettingsChange={setCrawlerSettings} />
          <Button size="sm" variant="outline" onClick={handleFindPeople} disabled={findingPeople || findingEmails} className="h-8 text-[12px]">
            {findingPeople ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Users className="mr-1.5 h-3.5 w-3.5" />}
            Find People
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto h-8 text-[12px]">Clear</Button>
        </div>
      )}

      {/* Progress bar */}
      {(findingEmails || findingPeople) && progressText && (
        <div className="space-y-2 rounded-lg border bg-muted/40 px-4 py-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">{progressText}</span>
            <span className="font-semibold tabular-nums">{Math.round((progressCurrent / progressTotal) * 100)}%</span>
          </div>
          <Progress value={(progressCurrent / progressTotal) * 100} className="h-1.5" />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-[13px] text-muted-foreground">
              {companies.length === 0 ? "No companies yet. Run a search to discover companies." : "No companies match your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Company</TableHead>
                <TableHead className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Domain</TableHead>
                <TableHead className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Emails</TableHead>
                <TableHead className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">People</TableHead>
                <TableHead className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Industries</TableHead>
                <TableHead className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Confidence</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const emails = emailsByCompany[c.id] || [];
                const people = peopleByCompany[c.id] || [];
                const isExpanded = expanded.has(c.id);
                const hasExpandContent = emails.length > 0 || people.length > 0 || lastDiagnostics[c.id];
                return (
                  <>
                    <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined} className="group transition-colors">
                      <TableCell className="py-3">
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                      </TableCell>
                      <TableCell className="px-1 py-3">
                        {hasExpandContent && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-50 group-hover:opacity-100 transition-opacity" onClick={() => toggleExpand(c.id)}>
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1.5">
                          <div>
                            <Link to={`/companies/${c.id}`} className="text-[13px] font-medium hover:text-primary transition-colors">{c.name}</Link>
                            {(c as any).address && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 max-w-[280px] flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{(c as any).address}</p>}
                            {!(c as any).address && c.summary && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 max-w-[280px]">{c.summary}</p>}
                          </div>
                          {c.status === "Contacted" && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Upload className="h-3 w-3 text-primary shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>Exported to Mailchimp</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground text-[13px]">
                          <Globe className="h-3 w-3" />{c.domain || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <Select value={c.status} onValueChange={(v) => handleInlineStatus(c, v)}>
                          <SelectTrigger className="h-7 w-28 border-none shadow-none px-0 focus:ring-0">
                            <Badge variant="secondary" className={cn("text-[11px] font-medium", statusColors[c.status] || "")}>{c.status}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-3">
                        {emails.length > 0 ? (
                          <Badge variant="secondary" className="bg-primary/8 text-primary text-[11px] cursor-pointer hover:bg-primary/15 transition-colors" onClick={() => toggleExpand(c.id)}>
                            <Mail className="h-3 w-3 mr-1" />{emails.length}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[13px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        {people.length > 0 ? (
                          <Badge variant="secondary" className="text-[11px] cursor-pointer hover:bg-secondary/80 transition-colors" onClick={() => toggleExpand(c.id)}>
                            <Users className="h-3 w-3 mr-1" />{people.length}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[13px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.industries?.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60">{tag}</Badge>
                          ))}
                          {(c.industries?.length ?? 0) > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{(c.industries?.length ?? 0) - 2}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        {c.confidence_score ? (
                          <span className="text-[13px] tabular-nums font-medium">{Math.round(c.confidence_score * 100)}%</span>
                        ) : (
                          <span className="text-muted-foreground text-[13px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        {c.website && (
                          <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground opacity-50 group-hover:opacity-100 transition-all">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasExpandContent && (
                      <TableRow key={`${c.id}-details`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={10} className="py-4 px-4">
                          <div className="pl-12 space-y-4">
                            {/* Emails section */}
                            {emails.length > 0 && (
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                                  <Mail className="h-3 w-3" /> Discovered Emails ({emails.length})
                                </p>
                                <div className="grid gap-2">
                                  {emails.map((e) => (
                                    <div key={e.id} className="flex items-center gap-3 text-[13px]">
                                      <Mail className="h-3.5 w-3.5 text-muted-foreground/60" />
                                      <a href={`mailto:${e.email_address}`} className="text-primary hover:underline font-medium">{e.email_address}</a>
                                      <Badge variant="outline" className={`text-[10px] ${contextColors[e.context || "General"] || ""}`}>{e.context || "General"}</Badge>
                                      {e.source_url && (
                                        <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:underline truncate max-w-[200px]">
                                          {new URL(e.source_url).pathname}
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* People section */}
                            {people.length > 0 && (
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                                  <Users className="h-3 w-3" /> Discovered People ({people.length})
                                </p>
                                <div className="grid gap-2">
                                  {people.map((p) => (
                                    <div key={p.id} className="flex items-center gap-3 text-[13px]">
                                      <Users className="h-3.5 w-3.5 text-muted-foreground/60" />
                                      <span className="font-medium">{p.full_name}</span>
                                      {p.title && <Badge variant="outline" className="text-[10px] font-normal">{p.title}</Badge>}
                                      {p.linkedin_url && (
                                        <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">LinkedIn</a>
                                      )}
                                      {p.confidence_score != null && (
                                        <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round(p.confidence_score * 100)}%</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Diagnostics */}
                            {lastDiagnostics[c.id] && (
                              <DiscoveryDiagnostics data={lastDiagnostics[c.id]} />
                            )}
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
