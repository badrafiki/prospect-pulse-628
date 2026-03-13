import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { fetchAllRows } from "@/lib/supabaseHelpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Mail, Filter, Users, Building2, Info, Upload, EyeOff, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MailchimpExportDialog } from "@/components/MailchimpExportDialog";

type Company = Tables<"companies">;
type Email = Tables<"emails">;
type Person = Tables<"people">;

const STATUSES = ["New", "Shortlisted", "Contacted", "Not a fit"] as const;

interface ExportRow {
  emailAddress: string;
  companyName: string;
  companyId: string;
  website: string;
  phone: string;
  address: string;
  tags: string;
  notes: string;
  personName: string;
  personTitle: string;
  personLinkedIn: string;
}

export default function ExportPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dataFilter, setDataFilter] = useState<"all" | "emails" | "people">("all");
  const [hideContacted, setHideContacted] = useState(false);
  const [mailchimpOpen, setMailchimpOpen] = useState(false);
  const { toast } = useToast();
  const location = useLocation();

  useEffect(() => {
    const load = async () => {
      const [companiesData, emailsData, peopleData] = await Promise.all([
        fetchAllRows<Company>("companies", { neq: { column: "status", value: "Archived" } }),
        fetchAllRows<Email>("emails"),
        fetchAllRows<Person>("people"),
      ]);
      setCompanies(companiesData);
      setEmails(emailsData);
      setPeople(peopleData);
      setLoading(false);
    };
    load();
  }, [location.key]);

  const rows = useMemo(() => {
    const companyMap = new Map(companies.map(c => [c.id, c]));
    const peopleByCompany = new Map<string, Person[]>();
    for (const p of people) {
      const list = peopleByCompany.get(p.company_id) || [];
      list.push(p);
      peopleByCompany.set(p.company_id, list);
    }

    const result: ExportRow[] = [];

    for (const email of emails) {
      const company = companyMap.get(email.company_id);
      if (!company) continue;
      if (company.status === "Archived") continue;
      if (hideContacted && company.status === "Contacted") continue;
      if (statusFilter !== "all" && company.status !== statusFilter) continue;
      if (dataFilter === "people") continue;

      // Try to pair with a person from same company
      const companyPeople = peopleByCompany.get(email.company_id) || [];
      const person = companyPeople[0];

      result.push({
        emailAddress: email.email_address,
        companyName: company.name,
        companyId: company.id,
        website: company.website || company.domain || "",
        phone: (company as any).phone || "",
        address: (company as any).address || "",
        tags: (company.industries || []).join(", "),
        notes: company.notes || "",
        personName: person?.full_name || "",
        personTitle: person?.title || "",
        personLinkedIn: person?.linkedin_url || "",
      });
    }

    // Add people-only rows (people without emails in their company)
    if (dataFilter !== "emails") {
      const emailCompanyIds = new Set(emails.map(e => e.company_id));
      for (const person of people) {
        if (emailCompanyIds.has(person.company_id) && dataFilter === "all") continue; // already included above
        const company = companyMap.get(person.company_id);
        if (!company) continue;
        if (company.status === "Archived") continue;
        if (hideContacted && company.status === "Contacted") continue;
        if (statusFilter !== "all" && company.status !== statusFilter) continue;

        result.push({
          emailAddress: "",
          companyName: company.name,
          companyId: company.id,
          website: company.website || company.domain || "",
          phone: (company as any).phone || "",
          address: (company as any).address || "",
          tags: (company.industries || []).join(", "),
          notes: company.notes || "",
          personName: person.full_name,
          personTitle: person.title || "",
          personLinkedIn: person.linkedin_url || "",
        });
      }
    }

    return result;
  }, [companies, emails, people, statusFilter, dataFilter, hideContacted]);

  const handleMarkContacted = async (companyIds: string[]) => {
    const { error } = await supabase
      .from("companies")
      .update({ status: "Contacted" })
      .in("id", companyIds);
    if (error) {
      toast({ title: "Failed to update statuses", description: error.message, variant: "destructive" });
    } else {
      setCompanies(prev => prev.map(c => companyIds.includes(c.id) ? { ...c, status: "Contacted" } : c));
    }
  };

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

    const header = "Email Address,Company Name,Website,Phone,Address,Tags,Notes,Person Name,Person Title,Person LinkedIn";
    const csvRows = rows.map(r =>
      [r.emailAddress, r.companyName, r.website, r.phone, r.address, r.tags, r.notes, r.personName, r.personTitle, r.personLinkedIn].map(escape).join(",")
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

      {/* Explainer */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 pt-4">
          <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p>This export combines data from your <Link to="/companies" className="text-primary hover:underline font-medium">Companies</Link>, discovered emails, and <Link to="/people" className="text-primary hover:underline font-medium">People</Link>.</p>
            <p className="text-muted-foreground">Each row represents an email or contact. Companies with multiple emails appear as multiple rows. Archived companies are excluded.</p>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="mr-2 h-4 w-4" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant={dataFilter === "emails" ? "default" : "outline"} onClick={() => setDataFilter(dataFilter === "emails" ? "all" : "emails")}>
          <Mail className="mr-2 h-4 w-4" />Emails Only
        </Button>
        <Button size="sm" variant={dataFilter === "people" ? "default" : "outline"} onClick={() => setDataFilter(dataFilter === "people" ? "all" : "people")}>
          <Users className="mr-2 h-4 w-4" />People Only
        </Button>
        <Button size="sm" variant={hideContacted ? "default" : "outline"} onClick={() => setHideContacted(!hideContacted)}>
          {hideContacted ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {hideContacted ? "Hiding Contacted" : "Showing Contacted"}
        </Button>
        <Button onClick={handleExport} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" />Export CSV
        </Button>
        <Button variant="outline" onClick={() => setMailchimpOpen(true)} disabled={rows.filter(r => r.emailAddress).length === 0}>
          <Upload className="mr-2 h-4 w-4" />Push to Mailchimp
        </Button>
      </div>

      {/* Preview */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No data to export. Discover emails and people for your companies first.
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
                  <TableHead>Company</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 50).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.emailAddress || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Link to={`/companies/${r.companyId}`} className="text-primary hover:underline flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />{r.companyName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.website}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{r.address || "—"}</TableCell>
                    <TableCell>{r.personName || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{r.personTitle ? <Badge variant="outline" className="text-xs">{r.personTitle}</Badge> : "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.tags.split(", ").filter(Boolean).map(t => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
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
      <MailchimpExportDialog rows={rows} open={mailchimpOpen} onOpenChange={setMailchimpOpen} onPushComplete={handleMarkContacted} />
    </div>
  );
}
