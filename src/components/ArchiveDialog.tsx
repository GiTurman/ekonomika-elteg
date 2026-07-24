import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Archive as ArchiveIcon } from "lucide-react";
import { ArchiveList } from "@/components/ArchiveList";

export function ArchiveDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArchiveIcon className="h-4 w-4 mr-1" /> არქივი
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>დასრულებული განფასებების არქივი</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          {/* key=open რომ ყოველ გახსნაზე თავიდან ჩაიტვირთოს სია */}
          {open && <ArchiveList key="dialog" onNavigateAway={() => setOpen(false)} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
