import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { Building2, Mail, Users, Search, ArrowRight, CheckCircle2, Clock, AlertCircle, Download } from "lucide-react";
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

    // Get counts of companies that have emails/people
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

    // Realtime: refresh stats when data changes
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people' }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const statCards = [
    { label: "Companies", value: stats.companies, icon: Building2, color: "text-primary", link: "/companies" },
    { label: "Emails Found", value: stats.emails, icon: Mail, color: "text-primary", link: "/companies", subtitle: `across ${stats.hasEmails} companies` },
    { label: "People", value: stats.people, icon: Users, color: "text-primary", link: "/people", subtitle: `across ${stats.hasPeople} companies` },
    { label: "Searches Run", value: stats.searches, icon: Search, color: "text-primary", link: "/search" },
  ];

  const statusColors: Record<string, string> = {
    New: "bg-secondary text-secondary-foreground",
    Shortlisted: "bg-primary/10 text-primary",
    Contacted: "bg-success/10 text-success",
    "Not a fit": "bg-destructive/10 text-destructive",
  };

  const completionRate = stats.companies > 0 ? Math.round((stats.completed / stats.companies) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your lead discovery pipeline</p>
      </div>

      {/* Stats row - clickable */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Link key={s.label} to={s.link}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className={cn("h-4 w-4", s.color)} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.value}</div>
                {s.subtitle && <p className="text-xs text-muted-foreground mt-1">{s.subtitle}</p>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pipeline summary - clickable */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/companies">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Shortlisted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.shortlisted}</div>
              <p className="text-xs text-muted-foreground mt-1">companies in pipeline</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enrichment Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.completed} of {stats.companies} analyzed</p>
          </CardContent>
        </Card>
        <Link to="/export">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ready to Export</CardTitle>
              <Download className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.emails + stats.people}</div>
              <p className="text-xs text-muted-foreground mt-1">emails & contacts available</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Searches */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Searches</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/search">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recentSearches.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center px-4">
                <Search className="h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No searches yet</p>
                <Button size="sm" asChild className="mt-3">
                  <Link to="/search">Run your first search</Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableBody>
                  {recentSearches.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{s.search_term}</span>
                          <div className="flex gap-2 mt-0.5">
                            {s.country && <span className="text-xs text-muted-foreground">{s.country}</span>}
                            {s.industry && <span className="text-xs text-muted-foreground">· {s.industry}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {s.results_count ?? 0} results
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground w-24">
                        {new Date(s.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Companies */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Companies</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/companies">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recentCompanies.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center px-4">
                <Building2 className="h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No companies discovered yet</p>
              </div>
            ) : (
              <Table>
                <TableBody>
                  {recentCompanies.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link to={`/companies/${c.id}`} className="hover:underline">
                          <span className="font-medium text-sm text-primary">{c.name}</span>
                          {c.domain && <p className="text-xs text-muted-foreground">{c.domain}</p>}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColors[c.status] || ""}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.processing_status === 'Completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-success inline" />
                        ) : c.processing_status === 'Error' ? (
                          <AlertCircle className="h-4 w-4 text-destructive inline" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground inline" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
