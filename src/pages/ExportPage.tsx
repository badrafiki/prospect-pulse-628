import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2, Mail, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Company = Tables<"companies">;
type Email = Tables<"emails">;

const STATUSES = ["New", "Shortlisted", "Contacted", "Not a fit"] as const;

interface ExportRow {
  emailAddress: string;
  companyName: string;
  website: string;
  tags: string;
  notes: string;
}

export default function ExportPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const [companiesRes, emailsRes] = await Promise.all([
        supabase.from("companies").select("*").neq("status", "Archived"),
        supabase.from("emails").select("*"),
      ]);
      setCompanies(companiesRes.data ?? []);
      setEmails(emailsRes.data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const rows = useMemo(() => {
    const companyMap = new Map(companies.map(c => [c.id, c]));
    const result: ExportRow[] = [];

    for (const email of emails) {
      const company = companyMap.get(email.company_id);
      if (!company) continue;
      if (company.status === "Archived") continue;
      if (statusFilter !== "all" && company.status !== statusFilter) continue;

      result.push({
        emailAddress: email.email_address,
        companyName: company.name,
        website: company.website || company.domain || "",
        tags: (company.industries || []).join(", "),
        notes: company.notes || "",
      });
    }
    return result;
  }, [companies, emails, statusFilter]);

  const handleExport = () => {
    if (rows.length === 0) {
      toast({ title: "Nothing to export", description: "No rows match your filters", variant: "destructive" });
      return;
    }

    const escape = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const header = "Email Address,Company Name,Website,Tags,Notes";
    const csvRows = rows.map(r =>
      [r.emailAddress, r.companyName, r.website, r.tags, r.notes].map(escape).join(",")
    );
    const csv = [header, ...csvRows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Exported", description: `${rows.length} rows downloaded as CSV` });
  };

  if (loading) {
    return <div className="p-6"><p className="text-muted-foreground text-sm">Loading...</p></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Export</h1>
        <p className="text-muted-foreground text-sm">Export your data as Mailchimp-compatible CSV</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
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
        <Button onClick={handleExport} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export {rows.length} rows
        </Button>
      </div>

      {/* Preview */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No emails to export. Discover emails for your companies first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Preview ({rows.length} rows)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 50).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.emailAddress}</TableCell>
                    <TableCell>{r.companyName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.website}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.tags.split(", ").filter(Boolean).map(t => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{r.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 50 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                Showing 50 of {rows.length} rows. All rows will be included in the export.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
