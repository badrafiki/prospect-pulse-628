import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { Building2, Mail, Users, Search, ArrowRight, CheckCircle2, Clock, AlertCircle, Download, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stats {
  companies: number;
  emails: number;
  people: number;
  searches: number;
  shortlisted: number;
  completed: number;
  pending: number;
  hasEmails: number;
  hasPeople: number;
}

interface RecentSearch {
  id: string;
  search_term: string;
  country: string | null;
  industry: string | null;
  results_count: number | null;
  created_at: string;
}

interface RecentCompany {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  processing_status: string;
  confidence_score: number | null;
  created_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ companies: 0, emails: 0, people: 0, searches: 0, shortlisted: 0, completed: 0, pending: 0, hasEmails: 0, hasPeople: 0 });
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [recentCompanies, setRecentCompanies] = useState<RecentCompany[]>([]);

  const fetchStats = async () => {
    const [c, e, p, s, sl, comp, pend] = await Promise.all([
      supabase.from("companies").select("id", { count: "exact", head: true }),
      supabase.from("emails").select("id", { count: "exact", head: true }),
      supabase.from("people").select("id", { count: "exact", head: true }),
      supabase.from("searches").select("id", { count: "exact", head: true }),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "Shortlisted"),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("processing_status", "Completed"),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("processing_status", "Pending"),
    ]);

    const [emailCompanies, peopleCompanies] = await Promise.all([
      supabase.from("emails").select("company_id"),
      supabase.from("people").select("company_id"),
    ]);
    const uniqueEmailCompanies = new Set((emailCompanies.data ?? []).map(e => e.company_id)).size;
    const uniquePeopleCompanies = new Set((peopleCompanies.data ?? []).map(p => p.company_id)).size;

    setStats({
      companies: c.count ?? 0,
      emails: e.count ?? 0,
      people: p.count ?? 0,
      searches: s.count ?? 0,
      shortlisted: sl.count ?? 0,
      completed: comp.count ?? 0,
      pending: pend.count ?? 0,
      hasEmails: uniqueEmailCompanies,
      hasPeople: uniquePeopleCompanies,
    });
  };

  useEffect(() => {
    if (!user) return;

    fetchStats();

    supabase
      .from("searches")
      .select("id, search_term, country, industry, results_count, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRecentSearches(data ?? []));

    supabase
      .from("companies")
      .select("id, name, domain, status, processing_status, confidence_score, created_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setRecentCompanies(data ?? []));

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people' }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const statCards = [
    { label: "Companies", value: stats.companies, icon: Building2, link: "/companies", iconBg: "bg-primary/10", iconColor: "text-primary" },
    { label: "Emails Found", value: stats.emails, icon: Mail, link: "/companies", subtitle: `across ${stats.hasEmails} companies`, iconBg: "bg-success/10", iconColor: "text-success" },
    { label: "People", value: stats.people, icon: Users, link: "/people", subtitle: `across ${stats.hasPeople} companies`, iconBg: "bg-[hsl(262,60%,55%)]/10", iconColor: "text-[hsl(262,60%,55%)]" },
    { label: "Searches Run", value: stats.searches, icon: Search, link: "/search", iconBg: "bg-warning/10", iconColor: "text-warning" },
  ];

  const statusColors: Record<string, string> = {
    New: "bg-secondary text-secondary-foreground",
    Shortlisted: "bg-primary/10 text-primary",
    Contacted: "bg-success/10 text-success",
    "Not a fit": "bg-destructive/10 text-destructive",
  };

  const completionRate = stats.companies > 0 ? Math.round((stats.completed / stats.companies) * 100) : 0;

  return (
    <div className="p-8 space-y-8 max-w-[1200px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of your lead discovery pipeline</p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Link key={s.label} to={s.link}>
            <Card className="group hover:shadow-md hover:border-border/80 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium text-muted-foreground">{s.label}</p>
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", s.iconBg)}>
                    <s.icon className={cn("h-4 w-4", s.iconColor)} />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-semibold tracking-tight">{s.value}</span>
                </div>
                {s.subtitle && (
                  <p className="text-[12px] text-muted-foreground mt-1">{s.subtitle}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pipeline summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/companies">
          <Card className="group hover:shadow-md hover:border-border/80 transition-all duration-200 cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-muted-foreground">Shortlisted</p>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3">
                <span className="text-3xl font-semibold tracking-tight">{stats.shortlisted}</span>
              </div>
              <p className="text-[12px] text-muted-foreground mt-1">companies in pipeline</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="p-5">
            <p className="text-[13px] font-medium text-muted-foreground">Enrichment Rate</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-semibold tracking-tight">{completionRate}%</span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">{stats.completed} of {stats.companies} analyzed</p>
          </CardContent>
        </Card>
        <Link to="/export">
          <Card className="group hover:shadow-md hover:border-border/80 transition-all duration-200 cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-muted-foreground">Ready to Export</p>
                <Download className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-3">
                <span className="text-3xl font-semibold tracking-tight">{stats.emails + stats.people}</span>
              </div>
              <p className="text-[12px] text-muted-foreground mt-1">emails & contacts available</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent data */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Searches */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-sm font-semibold">Recent Searches</CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-[13px] text-muted-foreground hover:text-foreground -mr-2">
              <Link to="/search">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recentSearches.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No searches yet</p>
                <Button size="sm" asChild className="mt-4">
                  <Link to="/search">Run your first search</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {recentSearches.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors">
                    <div>
                      <span className="text-[13px] font-medium">{s.search_term}</span>
                      <div className="flex gap-2 mt-0.5">
                        {s.country && <span className="text-[11px] text-muted-foreground">{s.country}</span>}
                        {s.industry && <span className="text-[11px] text-muted-foreground">· {s.industry}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[12px] text-muted-foreground tabular-nums">{s.results_count ?? 0} results</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Companies */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-sm font-semibold">Recent Companies</CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-[13px] text-muted-foreground hover:text-foreground -mr-2">
              <Link to="/companies">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recentCompanies.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No companies discovered yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {recentCompanies.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors">
                    <Link to={`/companies/${c.id}`} className="group flex-1 min-w-0">
                      <span className="text-[13px] font-medium group-hover:text-primary transition-colors">{c.name}</span>
                      {c.domain && <p className="text-[11px] text-muted-foreground">{c.domain}</p>}
                    </Link>
                    <div className="flex items-center gap-3 ml-4">
                      <Badge variant="secondary" className={cn("text-[11px] font-medium", statusColors[c.status] || "")}>
                        {c.status}
                      </Badge>
                      {c.processing_status === 'Completed' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : c.processing_status === 'Error' ? (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
