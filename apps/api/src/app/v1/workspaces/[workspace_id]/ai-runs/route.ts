import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { handleApiError, AppError } from '@/lib/errors';
import pool from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    const body = await req.json();

    // Kiểm tra quyền truy cập workspace
    const member = await pool.query(
      "SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND status='active'",
      [params.workspace_id, actor.id]
    );
    if (!member.rows[0]) throw new AppError(403, 'PERMISSION_DENIED', 'Không có quyền truy cập workspace này');

    const aiUrl = process.env.INTERNAL_AI_URL || 'http://localhost:5000';
    const aiToken = process.env.INTERNAL_AI_AUTH_TOKEN || '';

    const aiRes = await fetch(`${aiUrl}/internal/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(aiToken ? { Authorization: `Bearer ${aiToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const aiData = await aiRes.json().catch(() => null);

    if (!aiRes.ok) {
      throw new AppError(
        aiRes.status,
        aiData?.error?.code || 'AI_ERROR',
        aiData?.error?.message || 'AI service trả về lỗi'
      );
    }

    return NextResponse.json(aiData, { status: aiRes.status });
  } catch (error) {
    return handleApiError(error);
  }
}