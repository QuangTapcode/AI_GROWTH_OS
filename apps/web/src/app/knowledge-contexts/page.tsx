'use client'

import { useState } from 'react'
import AppShell from '@/features/shell/AppShell'
import { useWorkspace } from '@/features/shell/WorkspaceProvider'
import { growthApi } from '@/lib/api'

function KnowledgeContexts() {
    const { workspace, canApprove } = useWorkspace()
    const [isCreating, setIsCreating] = useState(false)
    const [result, setResult] = useState<Record<string, unknown> | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleIssue = async () => {
        setIsCreating(true)
        setError(null)
        setResult(null)
        try {
            setResult(await growthApi.createKnowledgeContext(workspace.id))
        } catch (e) {
            setError((e as Error).message || 'Tạo context thất bại')
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <div className="p-6 lg:p-9">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Knowledge Contexts</h1>
                <p className="text-slate-500 mb-6">
                    Tạo snapshot bối cảnh tri thức cho workspace {workspace.name}. Snapshot được dựng
                    từ business profile và các nguồn đã duyệt của workspace; agent Research &amp; Trend
                    chỉ dùng snapshot này.
                </p>

                <div className="bg-white rounded-xl shadow-sm p-6">
                    {error && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded mb-4">
                            {error}
                        </div>
                    )}
                    {result && (
                        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-3 rounded mb-4">
                            Đã tạo context. Bạn có thể chạy agent Research &amp; Trend.
                            <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(result, null, 2)}</pre>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleIssue}
                        disabled={isCreating || !canApprove}
                        className="w-full bg-blue-600 text-white font-medium py-2 rounded hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isCreating ? 'Đang tạo...' : 'Tạo snapshot context'}
                    </button>
                    {!canApprove && (
                        <p className="mt-2 text-sm text-slate-500">
                            Chỉ Owner hoặc Editor mới tạo được context.
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function KnowledgeContextsPage() {
    return (
        <AppShell activeTab="overview" pageTitle="Knowledge Contexts">
            <KnowledgeContexts />
        </AppShell>
    )
}