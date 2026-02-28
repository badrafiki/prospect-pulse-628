import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Users, Search, ExternalLink, Building2 } from "lucide-react";

type Person = Tables<"people">;
type Company = Tables<"companies">;

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("people").select("*").order("created_at", { ascending: false }),
      supabase.from("companies").select("*"),
    ]).then(([peopleRes, companiesRes]) => {
      setPeople(peopleRes.data ?? []);
      const map: Record<string, Company> = {};
      for (const c of companiesRes.data ?? []) map[c.id] = c;
      setCompanies(map);
      setLoading(false);
    });
  }, []);

  const filtered = people.filter((p) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    const company = companies[p.company_id];
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.title?.toLowerCase().includes(q) ||
      company?.name.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="p-6"><p className="text-muted-foreground text-sm">Loading...</p></div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">People</h1>
        <p className="text-muted-foreground text-sm">{people.length} contacts discovered</p>
      </div>

      {people.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter by name, title, company..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="pl-9" />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {people.length === 0
                ? "No people yet. Select companies and use 'Find People' to discover contacts."
                : "No people match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>LinkedIn</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const company = companies[p.company_id];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>
                      {p.title ? (
                        <Badge variant="outline" className="text-xs font-normal">{p.title}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {company?.name || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.linkedin_url ? (
                        <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm flex items-center gap-1">
                          <ExternalLink className="h-3.5 w-3.5" />Profile
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {p.confidence_score ? `${Math.round(p.confidence_score * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
