import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArchiveList } from "@/components/ArchiveList";

export function ArchiveSheet() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>დასრულებული განფასებების არქივი</CardTitle>
      </CardHeader>
      <CardContent>
        <ArchiveList />
      </CardContent>
    </Card>
  );
}
