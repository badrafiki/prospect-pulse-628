import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Globe, FileSearch, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export type ImportDiagnosticsData = {
  listing_pages_crawled: number;
  listing_page_urls: string[];
  detail_urls_discovered: number;
  detail_pages_scraped: number;
  detail_pages_extra_scraped: number;
  extraction_successes: number;
  extraction_failures: number;
  extraction_rate_pct: number;
  detail_page_urls: string[];
};

export function ImportDiagnostics({ data }: { data: ImportDiagnosticsData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Import Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                Listing pages crawled
              </TableCell>
              <TableCell className="text-right font-medium">{data.listing_pages_crawled}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="flex items-center gap-2">
                <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                Detail URLs discovered
              </TableCell>
              <TableCell className="text-right font-medium">{data.detail_urls_discovered}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="flex items-center gap-2">
                <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                Detail pages scraped
              </TableCell>
              <TableCell className="text-right font-medium">{data.detail_pages_scraped}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                Extraction successes
              </TableCell>
              <TableCell className="text-right font-medium text-green-600">{data.extraction_successes}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                Extraction failures
              </TableCell>
              <TableCell className="text-right font-medium text-destructive">{data.extraction_failures}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {/* Success rate bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Extraction success rate</span>
            <Badge variant={data.extraction_rate_pct >= 80 ? "default" : data.extraction_rate_pct >= 50 ? "secondary" : "destructive"}>
              {data.extraction_rate_pct}%
            </Badge>
          </div>
          <Progress value={data.extraction_rate_pct} className="h-2" />
        </div>

        {/* Detail page URLs */}
        {data.detail_page_urls.length > 0 && (
          <details className="pt-1">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Detail pages scraped ({data.detail_page_urls.length})
            </summary>
            <ul className="mt-2 space-y-0.5 pl-4 list-disc text-xs text-muted-foreground max-h-48 overflow-auto">
              {data.detail_page_urls.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Listing page URLs */}
        {data.listing_page_urls.length > 0 && (
          <details className="pt-1">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Listing pages crawled ({data.listing_page_urls.length})
            </summary>
            <ul className="mt-2 space-y-0.5 pl-4 list-disc text-xs text-muted-foreground max-h-48 overflow-auto">
              {data.listing_page_urls.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
