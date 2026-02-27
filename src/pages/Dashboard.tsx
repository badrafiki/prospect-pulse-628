import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Building2, Mail, Users, Search, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ companies: 0, emails: 0, people: 0, searches: 0 });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("companies").select("id", { count: "exact", head: true }),
      supabase.from("emails").select("id", { count: "exact", head: true }),
      supabase.from("people").select("id", { count: "exact", head: true }),
      supabase.from("searches").select("id", { count: "exact", head: true }),
    ]).then(([c, e, p, s]) => {
      setStats({
        companies: c.count ?? 0,
        emails: e.count ?? 0,
        people: p.count ?? 0,
        searches: s.count ?? 0,
      });
    });
  }, [user]);

  const statCards = [
    { label: "Companies", value: stats.companies, icon: Building2, color: "text-primary" },
    { label: "Emails Found", value: stats.emails, icon: Mail, color: "text-accent" },
    { label: "People", value: stats.people, icon: Users, color: "text-success" },
    { label: "Searches", value: stats.searches, icon: Search, color: "text-warning" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Overview of your lead discovery pipeline
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className={cn("h-4 w-4", s.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Start discovering companies</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Search for companies by keyword, industry, and region. We'll analyze their websites and help you find the right contacts.
          </p>
          <Button asChild className="mt-4">
            <Link to="/search">
              New Search <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

