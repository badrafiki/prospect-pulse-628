import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Mail, CheckCircle2, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const [verifying, setVerifying] = useState(true);
  const [connected, setConnected] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const verifyConnection = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("mailchimp", {
        body: { action: "verify" },
      });
      if (error || data?.error) {
        setConnected(false);
      } else {
        setConnected(true);
        setAccountName(data.accountName || "");
      }
    } catch {
      setConnected(false);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    verifyConnection();
  }, []);

  const handleUpdateKey = async () => {
    if (!newKey.trim()) return;
    if (!newKey.includes('-')) {
      toast({ title: "Invalid format", description: "Mailchimp API keys look like: abc123def-us21", variant: "destructive" });
      return;
    }
    setUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("mailchimp", {
        body: { action: "update-key", apiKey: newKey.trim() },
      });
      if (error || data?.error) {
        toast({ title: "Invalid API key", description: data?.error || "Could not verify the key", variant: "destructive" });
      } else {
        toast({ title: "API key is valid", description: `Connected to ${data.accountName}. To save it permanently, update the secret in your backend settings.` });
        setConnected(true);
        setAccountName(data.accountName || "");
        setNewKey("");
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">Configure your integrations and preferences</p>
      </div>

      {/* Mailchimp Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <Mail className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <CardTitle className="text-base">Mailchimp</CardTitle>
                <CardDescription>Push contacts directly to your Mailchimp audiences</CardDescription>
              </div>
            </div>
            {verifying ? (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />Checking...
              </Badge>
            ) : connected ? (
              <Badge variant="outline" className="gap-1 border-green-500/30 text-green-600">
                <CheckCircle2 className="h-3 w-3" />Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
                <XCircle className="h-3 w-3" />Not connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected && accountName && (
            <p className="text-sm text-muted-foreground">
              Account: <span className="font-medium text-foreground">{accountName}</span>
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="mailchimp-key">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="mailchimp-key"
                  type={showKey ? "text" : "password"}
                  placeholder="e.g. abc123def456-us21"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  maxLength={100}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={handleUpdateKey} disabled={!newKey.trim() || updating}>
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Find your API key in Mailchimp → Account → Extras → API keys. To permanently update the stored key, use the backend secrets manager.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder for future settings */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Settings className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            More settings will be available in future updates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
