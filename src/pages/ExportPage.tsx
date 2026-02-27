import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";

export default function ExportPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Export</h1>
        <p className="text-muted-foreground text-sm">Export your data as CSV</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Download className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Export functionality will be available once you have companies in your CRM.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
