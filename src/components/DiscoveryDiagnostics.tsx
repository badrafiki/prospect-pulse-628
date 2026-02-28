import { Badge } from "@/components/ui/badge";
import { Globe, FileText, Search, Mail } from "lucide-react";

export type DiagnosticsData = {
  sitemaps_found: number;
  sitemap_urls_discovered: number;
  map_urls_discovered: number;
  pages_scraped: number;
  urls_scraped: string[];
  mailto_count: number;
  regex_count: number;
  ai_count: number;
  emails_found: number;
  mode: string;
};

export function DiscoveryDiagnostics({ data }: { data: DiagnosticsData }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
      <p className="font-medium text-sm text-foreground">Discovery Diagnostics</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1">
          <FileText className="h-3 w-3" />
          {data.sitemaps_found} sitemaps
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Globe className="h-3 w-3" />
          {data.sitemap_urls_discovered} sitemap URLs
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Search className="h-3 w-3" />
          {data.map_urls_discovered} map URLs
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Globe className="h-3 w-3" />
          {data.pages_scraped} pages scraped
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1">
          <Mail className="h-3 w-3" />
          {data.mailto_count} mailto
        </Badge>
        <Badge variant="secondary" className="gap-1">
          {data.regex_count} regex
        </Badge>
        {data.ai_count > 0 && (
          <Badge variant="secondary" className="gap-1">
            {data.ai_count} AI
          </Badge>
        )}
        <Badge className="gap-1 bg-primary/10 text-primary">
          {data.emails_found} new saved
        </Badge>
        <Badge variant="outline">{data.mode}</Badge>
      </div>
      {data.urls_scraped.length > 0 && (
        <details className="pt-1">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">URLs scraped</summary>
          <ul className="mt-1 space-y-0.5 pl-4 list-disc text-muted-foreground">
            {data.urls_scraped.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
