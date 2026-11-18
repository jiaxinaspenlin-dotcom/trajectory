// Remove from Shortlist: clears Saved / Monitoring / Dismissed entirely, both the
// value kept in this browser and one held on the shared record. The stage never
// changes.

import { api } from "@/lib/api";
import { clearPipelineStatus } from "@/lib/myWorkspace";

export async function removeFromShortlist(id: number): Promise<void> {
  await api.post(`/api/sourcing/prospects/${id}/action`, { action: "clear_shortlist" });
  clearPipelineStatus(id);
}
