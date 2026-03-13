import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Globe, ExternalLink, Linkedin, Mail, Users, MapPin,
  Package, Clock, Building2, Save, Loader2, Trash2, Phone
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
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const handleDelete = async () => {
    if (!company) return;
    setDeleting(true);
    const { error } = await supabase.from("companies").delete().eq("id", company.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Error", description: "Failed to delete company", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: `${company.name} and all related data removed` });
      navigate("/companies");
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
    return (
      <div className="p-8 max-w-[900px] mx-auto">
        <div className="flex items-center gap-3 py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-[13px]">Loading company…</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-8 max-w-[900px] mx-auto space-y-4">
        <Link to="/companies" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Companies
        </Link>
        <p className="text-muted-foreground text-[13px]">Company not found.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[900px] mx-auto">
      {/* Back link */}
      <Link to="/companies" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Companies
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{company.name}</h1>
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground flex-wrap">
            {company.domain && (
              <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-muted-foreground/50" />{company.domain}</span>
            )}
            {company.website && (
              <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />Website
              </a>
            )}
            {company.linkedin_url && (
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Linkedin className="h-3.5 w-3.5" />LinkedIn
              </a>
            )}
            {(company as any).phone && (
              <a href={`tel:${(company as any).phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Phone className="h-3.5 w-3.5" />{(company as any).phone}
              </a>
            )}
            {(company as any).address && (
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground/50" />{(company as any).address}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {company.confidence_score != null && (
            <span className="text-[12px] text-muted-foreground tabular-nums">{Math.round(company.confidence_score * 100)}% confidence</span>
          )}
          <Select value={company.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-auto h-8 gap-1.5 border-border/60 text-[13px]">
              <Badge variant="secondary" className={`text-[11px] ${statusColors[company.status] || ""}`}>{company.status}</Badge>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="text-[13px]">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[12px] text-destructive border-destructive/20 hover:bg-destructive/5" disabled={deleting}>
                {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {company.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this company and all its associated emails ({emails.length}) and people ({people.length}). This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Summary */}
      {company.summary && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[13px] leading-relaxed text-foreground/90">{company.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Metadata tags */}
      {(company.industries?.length || company.locations?.length || company.products_services?.length) && (
        <div className="flex flex-wrap gap-6">
          {company.industries && company.industries.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Industries</p>
              <div className="flex flex-wrap gap-1">{company.industries.map(i => <Badge key={i} variant="outline" className="text-[11px] font-normal border-border/60">{i}</Badge>)}</div>
            </div>
          )}
          {company.locations && company.locations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1"><MapPin className="h-3 w-3" />Locations</p>
              <div className="flex flex-wrap gap-1">{company.locations.map(l => <Badge key={l} variant="secondary" className="text-[11px] font-normal">{l}</Badge>)}</div>
            </div>
          )}
          {company.products_services && company.products_services.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1"><Package className="h-3 w-3" />Products & Services</p>
              <div className="flex flex-wrap gap-1">{company.products_services.map(p => <Badge key={p} variant="secondary" className="text-[11px] font-normal">{p}</Badge>)}</div>
            </div>
          )}
        </div>
      )}

      <Separator className="bg-border/40" />

      {/* Two-column grid: Notes + Emails */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Notes */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-[13px] font-semibold tracking-normal">Notes</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-2.5">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this company..."
              rows={5}
              className="text-[13px] bg-muted/30 border-border/60 focus:bg-background transition-colors resize-none"
            />
            <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes} className="h-8 text-[12px]">
              {savingNotes ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save Notes
            </Button>
          </CardContent>
        </Card>

        {/* Emails */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-[13px] font-semibold tracking-normal flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground/60" /> Emails
              <span className="text-[11px] font-normal text-muted-foreground ml-auto">{emails.length} found</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {emails.length === 0 ? (
              <p className="text-[12px] text-muted-foreground py-3">No emails discovered yet.</p>
            ) : (
              <div className="space-y-2">
                {emails.map((e) => (
                  <div key={e.id} className="flex items-center gap-2.5 text-[13px] py-1">
                    <a href={`mailto:${e.email_address}`} className="text-primary hover:underline font-medium truncate">{e.email_address}</a>
                    <Badge variant="outline" className={`text-[10px] font-normal shrink-0 ${contextColors[e.context || "General"] || ""}`}>{e.context || "General"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* People */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2 px-5 pt-4">
          <CardTitle className="text-[13px] font-semibold tracking-normal flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground/60" /> People
            <span className="text-[11px] font-normal text-muted-foreground ml-auto">{people.length} found</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {people.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-3">No people discovered yet.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {people.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <span className="font-medium text-[13px] text-foreground">{p.full_name}</span>
                    {p.title && <span className="text-[12px] text-muted-foreground ml-2">{p.title}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.confidence_score != null && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round(p.confidence_score * 100)}%</span>
                    )}
                    {p.linkedin_url && (
                      <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
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
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2 px-5 pt-4">
          <CardTitle className="text-[13px] font-semibold tracking-normal flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/60" /> Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {timeline.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-3">No activity yet.</p>
          ) : (
            <div className="relative pl-5 border-l border-border/40 space-y-4">
              {timeline.map((event, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[27px] top-0.5 h-5 w-5 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                    {event.icon}
                  </div>
                  <p className="text-[13px] text-foreground/90">{event.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(event.date).toLocaleDateString()} · {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
