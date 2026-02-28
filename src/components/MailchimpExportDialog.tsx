import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportRow {
  emailAddress: string;
  companyName: string;
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
  errors: { email_address: string; error: string }[];
}

export function MailchimpExportDialog({
  rows,
  open,
  onOpenChange,
}: {
  rows: ExportRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [selectedAudience, setSelectedAudience] = useState("");
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<MailchimpPushResult | null>(null);
  const { toast } = useToast();

  const fetchAudiences = async () => {
    setLoadingAudiences(true);
    try {
      const { data, error } = await supabase.functions.invoke("mailchimp", {
        body: { action: "list-audiences" },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setAudiences(data.audiences || []);
    } catch (e: any) {
      toast({ title: "Failed to load audiences", description: e.message, variant: "destructive" });
    } finally {
      setLoadingAudiences(false);
    }
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      setResult(null);
      setSelectedAudience("");
      fetchAudiences();
    }
    onOpenChange(open);
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
      setResult(data);
      toast({
        title: "Pushed to Mailchimp",
        description: `${data.new_members} new, ${data.updated_members} updated`,
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
        ) : (
          <div className="space-y-4 py-2">
            {loadingAudiences ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading audiences...
              </div>
            ) : audiences.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No audiences found. Create one in Mailchimp first.
              </p>
            ) : (
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
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
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
