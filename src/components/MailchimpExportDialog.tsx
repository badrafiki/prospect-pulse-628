import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Upload, Loader2, CheckCircle2, AlertCircle, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportRow {
  emailAddress: string;
  companyName: string;
  companyId: string;
  website: string;
  tags: string;
  personName: string;
  personTitle: string;
}

interface Audience {
  id: string;
  name: string;
  memberCount: number;
}

interface MailchimpPushResult {
  new_members: number;
  updated_members: number;
  error_count: number;
  errors: { email_address: string; error: string; error_code?: string }[];
  compliance_removed?: number;
}

export function MailchimpExportDialog({
  rows,
  open,
  onOpenChange,
  onPushComplete,
}: {
  rows: ExportRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPushComplete?: (companyIds: string[]) => void;
}) {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [selectedAudience, setSelectedAudience] = useState("");
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<MailchimpPushResult | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAudience, setNewAudience] = useState({ name: "", company: "", fromEmail: "", fromName: "" });
  const { toast } = useToast();

  const fetchAudiences = async () => {
    setLoadingAudiences(true);
    setAudienceError(null);
    try {
      const { data, error } = await supabase.functions.invoke("mailchimp", {
        body: { action: "list-audiences" },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setAudiences(data.audiences || []);
    } catch (e: any) {
      const message = e?.message || "Unknown error";
      setAudienceError(message);
      toast({ title: "Failed to load audiences", description: message, variant: "destructive" });
    } finally {
      setLoadingAudiences(false);
    }
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      setResult(null);
      setSelectedAudience("");
      setShowCreate(false);
      setNewAudience({ name: "", company: "", fromEmail: "", fromName: "" });
      fetchAudiences();
    }
    onOpenChange(open);
  };

  const handleCreateAudience = async () => {
    const { name, company, fromEmail, fromName } = newAudience;
    if (!name.trim() || !company.trim() || !fromEmail.trim() || !fromName.trim()) {
      toast({ title: "All fields required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("mailchimp", {
        body: { action: "create-audience", name: name.trim(), company: company.trim(), fromEmail: fromEmail.trim(), fromName: fromName.trim() },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast({ title: "Audience created", description: data.name });
      setSelectedAudience(data.id);
      setShowCreate(false);
      setNewAudience({ name: "", company: "", fromEmail: "", fromName: "" });
      await fetchAudiences();
    } catch (e: any) {
      toast({ title: "Failed to create audience", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handlePush = async () => {
    if (!selectedAudience) return;
    setPushing(true);
    setResult(null);
    try {
      const emailRows = rows.filter(r => r.emailAddress);
      const { data, error } = await supabase.functions.invoke("mailchimp", {
        body: {
          action: "push-contacts",
          listId: selectedAudience,
          contacts: emailRows,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Detect compliance errors (permanently deleted emails)
      const complianceErrors = (data.errors || []).filter(
        (e: any) => e.error_code === "ERROR_CONTACT_EXISTS" ||
          (e.error && /compliance|permanently deleted|forgotten/i.test(e.error))
      );

      let complianceRemoved = 0;
      if (complianceErrors.length > 0) {
        const badEmails = complianceErrors.map((e: any) => e.email_address?.toLowerCase()).filter(Boolean);

        // Find matching rows to get company IDs
        const affectedRows = emailRows.filter(r => badEmails.includes(r.emailAddress.toLowerCase()));
        const affectedCompanyIds = [...new Set(affectedRows.map(r => r.companyId).filter(Boolean))];

        // Delete the bad emails from DB
        if (badEmails.length > 0) {
          await supabase.from("emails").delete().in("email_address", badEmails);
        }

        // Archive the affected companies
        if (affectedCompanyIds.length > 0) {
          await supabase.from("companies").update({ status: "Archived" }).in("id", affectedCompanyIds);
        }

        complianceRemoved = badEmails.length;

        toast({
          title: "Compliance cleanup",
          description: `${complianceRemoved} permanently deleted email(s) removed and their companies archived.`,
        });
      }

      // Filter out compliance errors from displayed errors
      const displayErrors = (data.errors || []).filter(
        (e: any) => e.error_code !== "ERROR_CONTACT_EXISTS" &&
          !(e.error && /compliance|permanently deleted|forgotten/i.test(e.error))
      );

      const pushResult: MailchimpPushResult = {
        ...data,
        errors: displayErrors,
        error_count: displayErrors.length,
        compliance_removed: complianceRemoved,
      };
      setResult(pushResult);

      // Mark pushed companies as Contacted (exclude archived ones)
      const archivedIds = new Set(
        complianceErrors.length > 0
          ? emailRows.filter(r => complianceErrors.some((e: any) => e.email_address?.toLowerCase() === r.emailAddress.toLowerCase())).map(r => r.companyId)
          : []
      );
      const companyIds = [...new Set(emailRows.map(r => r.companyId).filter(id => id && !archivedIds.has(id)))];
      if (companyIds.length > 0 && onPushComplete) {
        onPushComplete(companyIds);
      }
      toast({
        title: "Pushed to Mailchimp",
        description: `${data.new_members} new, ${data.updated_members} updated.`,
      });
    } catch (e: any) {
      toast({ title: "Push failed", description: e.message, variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  const emailCount = rows.filter(r => r.emailAddress).length;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export to Mailchimp</DialogTitle>
          <DialogDescription>
            Push {emailCount} contacts with emails to a Mailchimp audience
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{result.new_members} new members added</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              <span>{result.updated_members} existing members updated</span>
            </div>
            {result.error_count > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{result.error_count} errors</span>
                </div>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground ml-6">
                    {e.email_address}: {e.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : showCreate ? (
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Audience Name</Label>
              <Input placeholder="e.g. CNC Leads" value={newAudience.name} onChange={e => setNewAudience(p => ({ ...p, name: e.target.value }))} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input placeholder="Your company name" value={newAudience.company} onChange={e => setNewAudience(p => ({ ...p, company: e.target.value }))} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>From Email</Label>
              <Input type="email" placeholder="you@company.com" value={newAudience.fromEmail} onChange={e => setNewAudience(p => ({ ...p, fromEmail: e.target.value }))} maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input placeholder="Your name" value={newAudience.fromName} onChange={e => setNewAudience(p => ({ ...p, fromName: e.target.value }))} maxLength={100} />
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {loadingAudiences ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading audiences...
              </div>
            ) : (
              <>
                {audiences.length > 0 ? (
                  <Select value={selectedAudience} onValueChange={setSelectedAudience}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an audience..." />
                    </SelectTrigger>
                    <SelectContent>
                      {audiences.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.memberCount} members)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border p-3 text-sm text-muted-foreground space-y-2">
                    <p>{audienceError ? "Couldn’t load audiences." : "No audiences found for this Mailchimp account yet."}</p>
                    {audienceError && <p className="text-destructive text-xs">{audienceError}</p>}
                    <Button variant="ghost" size="sm" onClick={fetchAudiences}>Retry</Button>
                  </div>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />Create new audience
                </Button>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {result ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          ) : showCreate ? (
            <>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Back</Button>
              <Button onClick={handleCreateAudience} disabled={creating}>
                {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create Audience"}
              </Button>
            </>
          ) : (
            <Button
              onClick={handlePush}
              disabled={!selectedAudience || pushing || emailCount === 0}
            >
              {pushing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Pushing...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />Push {emailCount} contacts</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
