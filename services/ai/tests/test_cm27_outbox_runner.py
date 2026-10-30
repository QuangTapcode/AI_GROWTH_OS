"""Bộ kiểm thử cho CM-27: OutboxRunner & TC-15 (Idempotency, Reconcile, Exponential Backoff, SKIP LOCKED).

Quy tắc bắt buộc:
1. Chỉ nhận bản đã approved và đã qua gateway_recheck.
2. Idempotency key: publish:{workspace}:{pack}:{channel}:{version}. Gửi trùng cùng key chỉ ra một bài, trả cùng post_id.
3. Retry theo exponential backoff; khi timeout phải gọi bước đối soát (reconcile) kiểm tra bài đã lên chưa trước khi thử lại.
4. Dùng claim SKIP LOCKED cho nhiều worker chạy song song.
Test: TC-15; mô phỏng timeout; 2 worker cùng lúc.
Hoàn thành khi: không có bài đăng trùng trong mọi kịch bản test.
"""

import asyncio
import hashlib
import json
import time
from typing import Any, Dict, List, Optional
import pytest

from src.agents.content.gateway_recheck import (
    GatewayRecheckRequest,
    compute_content_sha256,
    recheck_before_outbox,
)


def build_idempotency_key(workspace_id: str, content_id: str, channel: str, version: int) -> str:
    """Tạo idempotency key theo đúng đặc tả: publish:{workspace}:{pack}:{channel}:{version}."""
    return f"publish:{workspace_id}:{content_id}:{channel.lower()}:{version}"


class MockPlatformAdapter:
    """Mô phỏng adapter mạng kết nối platform (Facebook, TikTok...)."""

    def __init__(self, channel: str, behavior: str = "success"):
        self.channel = channel
        self.behavior = behavior  # 'success', 'timeout_reconciled', 'timeout_not_reconciled'
        self.publish_calls = 0
        self.reconcile_calls = 0
        self.published_posts: Dict[str, str] = {}  # key -> post_id

    async def publish(self, idempotency_key: str, payload: dict) -> Dict[str, Any]:
        self.publish_calls += 1
        if self.behavior in ("timeout_reconciled", "timeout_not_reconciled"):
            # Giả lập timeout mạng
            return {"success": False, "error_code": "CMS_TIMEOUT", "message": "Platform timed out after 30s"}

        post_id = f"ext_{self.channel}_{self.publish_calls}_{time.time_ns()}"
        self.published_posts[idempotency_key] = post_id
        return {"success": True, "post_id": post_id, "url": f"https://{self.channel}.com/p/{post_id}"}

    async def reconcile(self, idempotency_key: str) -> Dict[str, Any]:
        self.reconcile_calls += 1
        if self.behavior == "timeout_reconciled":
            # Đối soát thành công: bài đã lên platform
            post_id = f"reconciled_{self.channel}_999"
            self.published_posts[idempotency_key] = post_id
            return {"success": True, "post_id": post_id}

        # Đối soát xác nhận bài chưa từng xuất hiện
        return {"success": False, "error_code": "POST_NOT_FOUND"}


class OutboxRunnerSimulator:
    """Mô phỏng OutboxRunner (PgBoss) quản lý hàng đợi và đảm bảo 0 bài đăng trùng."""

    def __init__(self, adapter: MockPlatformAdapter, max_retries: int = 3, max_backoff_sec: int = 60):
        self.adapter = adapter
        self.max_retries = max_retries
        self.max_backoff_sec = max_backoff_sec
        # Database in-memory
        self.publishing_jobs: Dict[str, dict] = {}
        self.outbox_events: List[dict] = []
        self._lock = asyncio.Lock()  # Mô phỏng SKIP LOCKED / row-level lock

    def seed_job_and_event(self, job_data: dict, retry_count: int = 1) -> str:
        job_id = job_data["id"]
        self.publishing_jobs[job_id] = job_data
        event_id = f"evt_{job_id}"
        self.outbox_events.append({
            "id": event_id,
            "job_id": job_id,
            "status": "pending",
            "retry_count": retry_count,
            "claimed_by": None,
        })
        return event_id

    async def claim_event_skip_locked(self, worker_id: str) -> Optional[dict]:
        """Mô phỏng FOR UPDATE SKIP LOCKED: lấy event pending đầu tiên chưa ai claim."""
        async with self._lock:
            for evt in self.outbox_events:
                if evt["status"] == "pending" and evt["claimed_by"] is None:
                    evt["claimed_by"] = worker_id
                    evt["status"] = "processing"
                    return evt
            return None

    async def run_once(self, worker_id: str = "worker_1") -> str:
        evt = await self.claim_event_skip_locked(worker_id)
        if not evt:
            return "empty"

        job = self.publishing_jobs[evt["job_id"]]

        # 1. Chỉ nhận bản đã approved và đã qua gateway_recheck
        req = GatewayRecheckRequest(
            workspace_id=job["workspace_id"],
            post_id=job["id"],
            channel=job["channel"],
            approval_id=job.get("approval_id"),
            approval_status=job.get("approval_status", "pending"),
            expected_version=job["version"],
            current_version=job["version"],
            expected_hash=job["content_hash"],
            current_content=job["payload"],
            expected_parent_version=1,
            current_parent_version=job.get("parent_version", 1),
            actor_role="editor",
        )
        recheck_res = recheck_before_outbox(req)
        if not recheck_res.authorized:
            evt["status"] = "failed"
            job["status"] = "failed"
            job["error_message"] = recheck_res.reason
            return "failed"

        # 2. Idempotency key: publish:{workspace}:{pack}:{channel}:{version}
        idempotency_key = build_idempotency_key(
            workspace_id=job["workspace_id"],
            content_id=job["content_id"],
            channel=job["channel"],
            version=job["version"],
        )

        # Kiểm tra xem đã có bài nào xuất bản với idempotency key này chưa
        for other_job in self.publishing_jobs.values():
            if (
                other_job["workspace_id"] == job["workspace_id"]
                and other_job.get("idempotency_key") == idempotency_key
                and other_job.get("status") == "published"
                and other_job.get("external_post_id")
            ):
                # Gửi trùng cùng key chỉ ra một bài, trả cùng post_id
                job["status"] = "published"
                job["external_post_id"] = other_job["external_post_id"]
                job["idempotency_key"] = idempotency_key
                evt["status"] = "published"
                return "published"

        job["idempotency_key"] = idempotency_key

        # 3. Xuất bản qua adapter
        res = await self.adapter.publish(idempotency_key, job["payload"])

        if not res.get("success"):
            is_timeout = res.get("error_code") == "CMS_TIMEOUT"
            if is_timeout:
                # Khi timeout PHẢI gọi bước đối soát (reconcile) kiểm tra bài đã lên chưa
                reconciled = await self.adapter.reconcile(idempotency_key)
                if reconciled.get("success") and reconciled.get("post_id"):
                    job["status"] = "published"
                    job["external_post_id"] = reconciled["post_id"]
                    evt["status"] = "published"
                    return "published"

                # Bài chưa lên -> Retry theo exponential backoff
                retry_count = evt["retry_count"]
                if retry_count <= self.max_retries:
                    backoff_sec = min(2 ** retry_count, self.max_backoff_sec)
                    evt["status"] = "pending"
                    evt["claimed_by"] = None
                    evt["retry_count"] += 1
                    job["status"] = "scheduled"
                    job["error_message"] = f"RETRY_EXPONENTIAL_BACKOFF: delay {backoff_sec}s"
                    return "deferred"

            evt["status"] = "failed"
            job["status"] = "failed"
            job["error_message"] = res.get("message", "Publish failed")
            return "failed"

        job["status"] = "published"
        job["external_post_id"] = res["post_id"]
        evt["status"] = "published"
        return "published"


class TestCM27OutboxRunner:
    """Test suite cho CM-27 & TC-15."""

    def test_tc15_idempotency_duplicate_send_same_key_single_post(self):
        """TC-15: Gửi trùng cùng idempotency key chỉ ra một bài, trả cùng post_id (0 bài trùng)."""

        async def _run():
            adapter = MockPlatformAdapter("facebook", "success")
            runner = OutboxRunnerSimulator(adapter)

            payload = {"title": "Đà Nẵng", "hook": "Review Sơn Trà", "body": ["Tuyệt vời"]}
            content_hash = compute_content_sha256(payload)

            # Job 1 đã duyệt
            job1 = {
                "id": "job_01",
                "workspace_id": "ws_danang",
                "content_id": "pack_100",
                "channel": "facebook",
                "version": 1,
                "approval_id": "appr_01",
                "approval_status": "approved",
                "content_hash": content_hash,
                "payload": payload,
                "parent_version": 1,
            }
            runner.seed_job_and_event(job1)

            # Chạy lần 1 -> Xuất bản thành công
            outcome1 = await runner.run_once("worker_A")
            assert outcome1 == "published"
            assert adapter.publish_calls == 1
            post_id_1 = runner.publishing_jobs["job_01"]["external_post_id"]
            assert post_id_1 is not None

            # Job 2 gửi trùng (cùng workspace, content_id, channel, version)
            job2 = {
                "id": "job_02_duplicate",
                "workspace_id": "ws_danang",
                "content_id": "pack_100",
                "channel": "facebook",
                "version": 1,
                "approval_id": "appr_02",
                "approval_status": "approved",
                "content_hash": content_hash,
                "payload": payload,
                "parent_version": 1,
            }
            runner.seed_job_and_event(job2)

            # Chạy lần 2 với event gửi trùng
            outcome2 = await runner.run_once("worker_B")
            assert outcome2 == "published"
            post_id_2 = runner.publishing_jobs["job_02_duplicate"]["external_post_id"]

            # BẢO ĐẢM TC-15: Cùng post_id, publisher KHÔNG được gọi lần 2 -> 0 bài đăng trùng!
            assert post_id_2 == post_id_1
            assert adapter.publish_calls == 1, "CẤM gọi publisher lần 2 khi cùng idempotency key!"

        asyncio.run(_run())

    def test_only_approved_and_rechecked_can_publish(self):
        """Chỉ nhận bản đã approved; chặn bản pending hoặc chưa duyệt."""

        async def _run():
            adapter = MockPlatformAdapter("facebook", "success")
            runner = OutboxRunnerSimulator(adapter)

            payload = {"title": "Bản nháp", "body": ["Chưa duyệt"]}
            content_hash = compute_content_sha256(payload)

            unapproved_job = {
                "id": "job_unapproved",
                "workspace_id": "ws_danang",
                "content_id": "pack_101",
                "channel": "facebook",
                "version": 1,
                "approval_id": None,
                "approval_status": "pending",  # Chưa duyệt
                "content_hash": content_hash,
                "payload": payload,
                "parent_version": 1,
            }
            runner.seed_job_and_event(unapproved_job)

            outcome = await runner.run_once("worker_A")
            assert outcome == "failed"
            assert adapter.publish_calls == 0, "Tuyệt đối không được gọi publisher khi chưa approved!"
            assert "APPROVAL_NOT_GRANTED" in runner.publishing_jobs["job_unapproved"]["error_message"]

        asyncio.run(_run())

    def test_timeout_reconcile_success_no_duplicate(self):
        """Mô phỏng timeout: Đối soát phát hiện bài ĐÃ lên -> Đánh dấu published, không thử lại."""

        async def _run():
            adapter = MockPlatformAdapter("facebook", "timeout_reconciled")
            runner = OutboxRunnerSimulator(adapter)

            payload = {"title": "Timeout test", "body": ["Check reconcile"]}
            content_hash = compute_content_sha256(payload)

            job = {
                "id": "job_timeout_01",
                "workspace_id": "ws_danang",
                "content_id": "pack_102",
                "channel": "facebook",
                "version": 1,
                "approval_id": "appr_03",
                "approval_status": "approved",
                "content_hash": content_hash,
                "payload": payload,
                "parent_version": 1,
            }
            runner.seed_job_and_event(job)

            outcome = await runner.run_once("worker_A")
            assert outcome == "published"
            assert adapter.publish_calls == 1
            assert adapter.reconcile_calls == 1, "Khi timeout PHẢI gọi bước reconcile!"
            assert runner.publishing_jobs["job_timeout_01"]["external_post_id"] == "reconciled_facebook_999"

        asyncio.run(_run())

    def test_timeout_reconcile_not_found_exponential_backoff(self):
        """Mô phỏng timeout: Đối soát xác nhận bài CHƯA lên -> Exponential backoff retry."""

        async def _run():
            adapter = MockPlatformAdapter("facebook", "timeout_not_reconciled")
            runner = OutboxRunnerSimulator(adapter)

            payload = {"title": "Timeout test 2", "body": ["Check not found"]}
            content_hash = compute_content_sha256(payload)

            job = {
                "id": "job_timeout_02",
                "workspace_id": "ws_danang",
                "content_id": "pack_103",
                "channel": "facebook",
                "version": 1,
                "approval_id": "appr_04",
                "approval_status": "approved",
                "content_hash": content_hash,
                "payload": payload,
                "parent_version": 1,
            }
            runner.seed_job_and_event(job, retry_count=2)

            outcome = await runner.run_once("worker_A")
            assert outcome == "deferred"
            assert adapter.publish_calls == 1
            assert adapter.reconcile_calls == 1
            assert "RETRY_EXPONENTIAL_BACKOFF" in runner.publishing_jobs["job_timeout_02"]["error_message"]
            # Delay 2^2 = 4s
            assert "delay 4s" in runner.publishing_jobs["job_timeout_02"]["error_message"]

        asyncio.run(_run())

    def test_two_workers_concurrent_skip_locked_zero_duplicates(self):
        """2 Worker chạy song song cùng lúc: Claim SKIP LOCKED -> Chia việc sạch sẽ, 0 bài đăng trùng."""

        async def _run():
            adapter = MockPlatformAdapter("tiktok", "success")
            runner = OutboxRunnerSimulator(adapter)

            payload_a = {"title": "Clip 1", "body": ["TikTok Sơn Trà"]}
            payload_b = {"title": "Clip 2", "body": ["TikTok Cầu Rồng"]}

            job_a = {
                "id": "job_parallel_A",
                "workspace_id": "ws_danang",
                "content_id": "pack_A",
                "channel": "tiktok",
                "version": 1,
                "approval_id": "appr_A",
                "approval_status": "approved",
                "content_hash": compute_content_sha256(payload_a),
                "payload": payload_a,
                "parent_version": 1,
            }
            job_b = {
                "id": "job_parallel_B",
                "workspace_id": "ws_danang",
                "content_id": "pack_B",
                "channel": "tiktok",
                "version": 1,
                "approval_id": "appr_B",
                "approval_status": "approved",
                "content_hash": compute_content_sha256(payload_b),
                "payload": payload_b,
                "parent_version": 1,
            }

            runner.seed_job_and_event(job_a)
            runner.seed_job_and_event(job_b)

            # Chạy 2 worker đồng thời bằng asyncio.gather
            results = await asyncio.gather(
                runner.run_once("worker_alpha"),
                runner.run_once("worker_beta"),
            )

            assert results == ["published", "published"]
            assert adapter.publish_calls == 2
            # Hai job nhận 2 external_post_id phân biệt
            post_a = runner.publishing_jobs["job_parallel_A"]["external_post_id"]
            post_b = runner.publishing_jobs["job_parallel_B"]["external_post_id"]
            assert post_a is not None and post_b is not None
            assert post_a != post_b, "Hai worker chia 2 việc khác nhau, không bị trùng!"

        asyncio.run(_run())
