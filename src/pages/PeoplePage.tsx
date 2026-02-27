import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users } from "lucide-react";

type Person = Tables<"people">;

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("people")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPeople(data ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-6"><p className="text-muted-foreground text-sm">Loading...</p></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">People</h1>
        <p className="text-muted-foreground text-sm">{people.length} contacts discovered</p>
      </div>

      {people.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No people yet. Discover people from shortlisted companies.
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
                <TableHead>LinkedIn</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.title || "—"}</TableCell>
                  <TableCell>
                    {p.linkedin_url ? (
                      <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">
                        View Profile
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {p.confidence_score ? `${Math.round(p.confidence_score * 100)}%` : "—"}
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
