import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, Search, ExternalLink, Building2, Trash2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Person = Tables<"people">;
type Company = Tables<"companies">;
type Email = Tables<"emails">;

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [emailsByCompany, setEmailsByCompany] = useState<Record<string, Email[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const { toast } = useToast();
  const location = useLocation();

  const fetchData = () => {
    Promise.all([
      supabase.from("people").select("*").order("created_at", { ascending: false }),
      supabase.from("companies").select("*"),
      supabase.from("emails").select("*"),
    ]).then(([peopleRes, companiesRes, emailsRes]) => {
      setPeople(peopleRes.data ?? []);
      const map: Record<string, Company> = {};
      for (const c of companiesRes.data ?? []) map[c.id] = c;
      setCompanies(map);
      const emailMap: Record<string, Email[]> = {};
      for (const e of emailsRes.data ?? []) {
        (emailMap[e.company_id] ??= []).push(e);
      }
      setEmailsByCompany(emailMap);
      setLoading(false);
    });
  };

  // Refetch on every navigation
  useEffect(() => { fetchData(); }, [location.key]);

  const handleDelete = async (personId: string) => {
    const { error } = await supabase.from("people").delete().eq("id", personId);
    if (error) {
      toast({ title: "Error", description: "Failed to delete person", variant: "destructive" });
    } else {
      setPeople((prev) => prev.filter((p) => p.id !== personId));
      toast({ title: "Deleted", description: "Contact removed" });
    }
  };

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
        <p className="text-muted-foreground text-sm">
          {people.length} contacts discovered across {Object.keys(companies).length} companies.
          Select companies in the <Link to="/companies" className="text-primary hover:underline">Companies</Link> tab and use "Find People" to discover more.
        </p>
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
                <TableHead>Company Emails</TableHead>
                <TableHead>LinkedIn</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const company = companies[p.company_id];
                const companyEmails = emailsByCompany[p.company_id] || [];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>
                      {p.title ? (
                        <Badge variant="outline" className="text-xs font-normal">{p.title}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {company ? (
                        <Link to={`/companies/${company.id}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <Building2 className="h-3.5 w-3.5" />{company.name}
                        </Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {companyEmails.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {companyEmails.slice(0, 2).map((e) => (
                            <Badge key={e.id} variant="secondary" className="text-xs">
                              <Mail className="h-3 w-3 mr-1" />{e.email_address}
                            </Badge>
                          ))}
                          {companyEmails.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{companyEmails.length - 2}</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
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
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {p.full_name}?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently remove this contact.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
