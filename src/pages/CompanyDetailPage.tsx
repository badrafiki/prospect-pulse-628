import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Globe, ExternalLink, Linkedin, Mail, Users, MapPin,
  Package, Clock, Building2, Save, Loader2
} from "lucide-react";

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

interface TimelineEvent {
  date: string;
  label: string;
  icon: React.ReactNode;
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const [companyRes, emailsRes, peopleRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase.from("emails").select("*").eq("company_id", id),
        supabase.from("people").select("*").eq("company_id", id),
      ]);
      setCompany(companyRes.data);
      setNotes(companyRes.data?.notes || "");
      setEmails(emailsRes.data ?? []);
      setPeople(peopleRes.data ?? []);
      setLoading(false);
    };
    fetch();
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!company) return;
    const { error } = await supabase.from("companies").update({ status: newStatus }).eq("id", company.id);
    if (!error) setCompany({ ...company, status: newStatus });
  };

  const handleSaveNotes = async () => {
    if (!company) return;
    setSavingNotes(true);
    const { error } = await supabase.from("companies").update({ notes }).eq("id", company.id);
    setSavingNotes(false);
    if (error) {
      toast({ title: "Error", description: "Failed to save notes", variant: "destructive" });
    } else {
      setCompany({ ...company, notes });
      toast({ title: "Saved", description: "Notes updated" });
    }
  };

  const timeline: TimelineEvent[] = [];
  if (company) {
    timeline.push({ date: company.created_at, label: "Company added to CRM", icon: <Building2 className="h-3.5 w-3.5" /> });
  }
  for (const e of emails) {
    timeline.push({ date: e.created_at, label: `Email discovered: ${e.email_address}`, icon: <Mail className="h-3.5 w-3.5" /> });
  }
  for (const p of people) {
    timeline.push({ date: p.created_at, label: `Person discovered: ${p.full_name}`, icon: <Users className="h-3.5 w-3.5" /> });
  }
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading) {
    return <div className="p-6"><p className="text-muted-foreground text-sm">Loading...</p></div>;
  }

  if (!company) {
    return (
      <div className="p-6 space-y-4">
        <Link to="/companies" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Companies
        </Link>
        <p className="text-muted-foreground">Company not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Back link */}
      <Link to="/companies" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Companies
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {company.domain && (
              <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{company.domain}</span>
            )}
            {company.website && (
              <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />Website
              </a>
            )}
            {company.linkedin_url && (
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                <Linkedin className="h-3.5 w-3.5" />LinkedIn
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {company.confidence_score != null && (
            <span className="text-sm text-muted-foreground">{Math.round(company.confidence_score * 100)}% confidence</span>
          )}
          <Select value={company.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-32 h-8">
              <Badge variant="secondary" className={statusColors[company.status] || ""}>{company.status}</Badge>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary & Metadata */}
      {company.summary && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm">{company.summary}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-4">
        {company.industries && company.industries.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Industries</p>
            <div className="flex flex-wrap gap-1">{company.industries.map(i => <Badge key={i} variant="outline" className="text-xs">{i}</Badge>)}</div>
          </div>
        )}
        {company.locations && company.locations.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Locations</p>
            <div className="flex flex-wrap gap-1">{company.locations.map(l => <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>)}</div>
          </div>
        )}
        {company.products_services && company.products_services.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" />Products & Services</p>
            <div className="flex flex-wrap gap-1">{company.products_services.map(p => <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>)}</div>
          </div>
        )}
      </div>

      <Separator />

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this company..." rows={4} />
          <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
            {savingNotes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Notes
          </Button>
        </CardContent>
      </Card>

      {/* Emails */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Emails ({emails.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails discovered yet.</p>
          ) : (
            <div className="space-y-2">
              {emails.map((e) => (
                <div key={e.id} className="flex items-center gap-3 text-sm">
                  <a href={`mailto:${e.email_address}`} className="text-primary hover:underline font-medium">{e.email_address}</a>
                  <Badge variant="outline" className={`text-xs ${contextColors[e.context || "General"] || ""}`}>{e.context || "General"}</Badge>
                  {e.source_url && (
                    <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline truncate max-w-[250px]">
                      {e.source_url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* People */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> People ({people.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No people discovered yet.</p>
          ) : (
            <div className="space-y-3">
              {people.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{p.full_name}</span>
                    {p.title && <span className="text-xs text-muted-foreground ml-2">{p.title}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.confidence_score != null && (
                      <span className="text-xs text-muted-foreground">{Math.round(p.confidence_score * 100)}%</span>
                    )}
                    {p.linkedin_url && (
                      <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <Linkedin className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((event, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 text-muted-foreground">{event.icon}</div>
                  <div>
                    <p>{event.label}</p>
                    <p className="text-xs text-muted-foreground">{new Date(event.date).toLocaleDateString()} {new Date(event.date).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
