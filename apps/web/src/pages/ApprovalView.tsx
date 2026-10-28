import React from "react";
import ApprovalView from "../components/ApprovalView";

export default function ApprovalViewPage() {
  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <ApprovalView
        workspaceId="ws_tripc_danang"
        workspaceName="TripC Da Nang"
        userRole="editor"
        postId="post_cm_2026_001"
      />
    </div>
  );
}
