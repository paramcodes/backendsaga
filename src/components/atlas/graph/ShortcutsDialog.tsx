import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "/", action: "Jump to search" },
  { keys: "↑ ↓", action: "Move through search results" },
  { keys: "Enter", action: "Open the highlighted result or connection" },
  { keys: "j / k", action: "Step through the connections of the selected concept" },
  { keys: "f", action: "Focus mode — centre on the selected concept" },
  { keys: "a", action: "Atlas mode — show the whole graph" },
  { keys: "1 2 3", action: "Neighbourhood depth in hops" },
  { keys: "l", action: "Toggle layer and relationship filters" },
  { keys: ".", action: "Fit the graph to the screen" },
  { keys: "Backspace", action: "Back along the trail" },
  { keys: "e", action: "Read the full entry for the selected concept" },
  { keys: "?", action: "Show this list" },
  { keys: "Esc", action: "Close panels and clear search" },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Keyboard shortcuts</DialogTitle>
          <DialogDescription>The graph is built to be driven without a mouse.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm text-muted-foreground">{shortcut.action}</span>
              <kbd className="shrink-0 rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px]">
                {shortcut.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
