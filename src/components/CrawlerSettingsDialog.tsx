import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Settings2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export type CrawlerSettings = {
  maxPages: number;
  sitemapDepth: number;
  includePaths: string;
  excludePaths: string;
};

const DEFAULT_SETTINGS: CrawlerSettings = {
  maxPages: 10,
  sitemapDepth: 8,
  includePaths: "",
  excludePaths: "/blog, /careers, /news",
};

export function CrawlerSettingsDialog({
  settings,
  onSettingsChange,
}: {
  settings: CrawlerSettings;
  onSettingsChange: (s: CrawlerSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(settings);

  const handleOpen = (v: boolean) => {
    if (v) setLocal(settings);
    setOpen(v);
  };

  const handleSave = () => {
    onSettingsChange(local);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          Crawler
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crawler Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Max pages to scrape</Label>
              <span className="text-sm font-medium tabular-nums">{local.maxPages}</span>
            </div>
            <Slider
              min={3}
              max={25}
              step={1}
              value={[local.maxPages]}
              onValueChange={([v]) => setLocal({ ...local, maxPages: v })}
            />
            <p className="text-xs text-muted-foreground">Higher = more thorough but slower and uses more credits</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sitemap scan depth</Label>
              <span className="text-sm font-medium tabular-nums">{local.sitemapDepth}</span>
            </div>
            <Slider
              min={1}
              max={20}
              step={1}
              value={[local.sitemapDepth]}
              onValueChange={([v]) => setLocal({ ...local, sitemapDepth: v })}
            />
            <p className="text-xs text-muted-foreground">Max number of sitemaps to parse (includes sitemap indexes)</p>
          </div>

          <div className="space-y-2">
            <Label>Include URL patterns</Label>
            <Textarea
              placeholder="e.g. /contact, /about, /team"
              value={local.includePaths}
              onChange={(e) => setLocal({ ...local, includePaths: e.target.value })}
              rows={2}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">Comma-separated patterns. Only scrape URLs containing these.</p>
          </div>

          <div className="space-y-2">
            <Label>Exclude URL patterns</Label>
            <Textarea
              placeholder="e.g. /blog, /careers, /news"
              value={local.excludePaths}
              onChange={(e) => setLocal({ ...local, excludePaths: e.target.value })}
              rows={2}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">Comma-separated patterns. Skip URLs containing these.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocal(DEFAULT_SETTINGS)}>
            Reset defaults
          </Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULT_SETTINGS };
