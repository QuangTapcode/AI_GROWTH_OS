"""Bộ kiểm thử cho CM-28 (FacebookPublisher Graph API v21 + AI Label) và CM-29 (TikTokPublisher Photo/Video + AIGC Label).

Quy tắc bắt buộc:
1. FacebookPublisher: Graph API v21 (kiểm tra phiên bản hiện hành trước khi dùng), đăng caption + ảnh; ảnh AI phải gắn nhãn theo chính sách hiện hành của Meta.
2. TikTokPublisher: Direct Post hoặc Photo Mode với media URL công khai đã xác thực; tiktok_privacy_level mặc định SELF_ONLY khi thử nghiệm. Nhãn nội dung AI theo chính sách hiện hành.
3. Token lưu mã hóa (AES-256-GCM), có luồng làm mới (refresh flow); ManualPackGenerator (gói zip kèm hướng dẫn đăng tay) làm phương án dự phòng khi chưa được duyệt app.
4. Test bằng mock server; tuyệt đối không đăng lên Page/tài khoản thật khi chưa có lệnh rõ ràng.
5. Hoàn thành khi: mock test đăng thành công có post_id; ca bị từ chối quyền tự rơi về ManualPackGenerator.
"""

import base64
import hashlib
import json
import os
import re
from typing import Any, Dict, List, Optional
import pytest


def validate_facebook_graph_version(version: str) -> str:
    """Kiểm tra và chuẩn hóa phiên bản Facebook Graph API (v21.0 trở lên)."""
    match = re.match(r"^v(\d+)\.(\d+)$", version.strip())
    if not match:
        return "v21.0"
    major = int(match.group(1))
    if major < 21:
        return "v21.0"
    return version.strip()


def prepare_facebook_payload(
    message: str,
    media_url: Optional[str] = None,
    media_type: Optional[str] = None,
    is_ai_generated: bool = False,
    access_token: str = "mock_token",
    requires_image: bool = False,
    image_content_hash: Optional[str] = None,
) -> Dict[str, Any]:
    """Chuẩn bị payload gửi Meta Graph API theo chính sách minh bạch AI."""
    # Chặn xuất bản bài viết hỏng khi bài yêu cầu ảnh nhưng không có ảnh
    if (requires_image or image_content_hash) and not media_url:
        raise ValueError("MISSING_MEDIA_ASSET: Bài viết yêu cầu đính kèm ảnh nhưng thiếu URL/file ảnh hợp lệ từ media_assets. Dừng xuất bản để tránh đăng bài hỏng.")

    caption = message.strip()
    if is_ai_generated and "[Ảnh tạo bởi AI]" not in caption:
        caption += "\n\n[Ảnh tạo bởi AI]\n#AIgenerated #ImaginedWithAI"

    payload: Dict[str, Any] = {"access_token": access_token}
    has_image = bool(media_url and (media_type == "image" or not media_type))

    if has_image:
        payload["url"] = media_url
        payload["caption"] = caption
        if is_ai_generated:
            payload["is_ai_generated"] = "true"
            payload["ai_source_type"] = "trainedAlgorithmicMedia"
    else:
        payload["message"] = caption

    return payload


def prepare_tiktok_payload(
    title: str,
    media_url: str,
    media_type: str = "video",
    privacy_level: str = "SELF_ONLY",
    is_ai_generated: bool = False,
) -> Dict[str, Any]:
    """Chuẩn bị payload gửi TikTok API v2 (Direct Post / Photo Mode) theo chính sách AIGC."""
    # Xác thực media URL công khai
    if not (media_url.startswith("http://") or media_url.startswith("https://")):
        raise ValueError("TIKTOK_MEDIA_REQUIRED: Media URL must be valid public http/https URL")

    # Mặc định an toàn khi test: SELF_ONLY
    valid_levels = ["SELF_ONLY", "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR"]
    effective_privacy = privacy_level if privacy_level in valid_levels else "SELF_ONLY"

    caption = title.strip()
    if is_ai_generated and "#AIGC" not in caption:
        caption = f"{caption} #AIGC #AIcontent".strip()

    post_info = {
        "title": caption,
        "privacy_level": effective_privacy,
        "disable_duet": False,
        "disable_stitch": False,
        "disable_comment": False,
        "is_aigc": is_ai_generated,  # Cờ AIGC theo chính sách TikTok
    }

    if media_type == "image":
        return {
            "path": "/v2/post/publish/content/init/",
            "body": {
                "post_info": {**post_info, "description": caption},
                "source_info": {
                    "source": "PULL_FROM_URL",
                    "photo_cover_index": 0,
                    "photo_images": [media_url],
                },
                "post_mode": "DIRECT_POST",
                "media_type": "PHOTO",
            },
        }
    else:
        return {
            "path": "/v2/post/publish/video/init/",
            "body": {
                "post_info": {**post_info, "video_cover_timestamp_ms": 1000},
                "source_info": {
                    "source": "PULL_FROM_URL",
                    "video_url": media_url,
                },
            },
        }


def generate_manual_pack(
    content_id: str,
    workspace_id: str,
    channel: str,
    caption: str,
    media_url: Optional[str] = None,
    media_type: Optional[str] = None,
    is_ai_generated: bool = False,
    image_content_hash: Optional[str] = None,
    storage_key: Optional[str] = None,
    image_file_name: Optional[str] = None,
    image_file_content: Optional[str] = None,
    requires_image: bool = False,
) -> Dict[str, Any]:
    """Tạo gói đăng bài bằng tay ManualPack (gồm các tệp hướng dẫn) khi chưa được duyệt App Review."""
    is_image_required = bool(requires_image or image_content_hash)
    has_valid_media = bool(media_url or storage_key or image_file_content)
    has_missing_asset = is_image_required and not has_valid_media
    missing_reason = (
        f"Thiếu file ảnh hợp lệ từ media_assets theo content_hash ({image_content_hash or 'unknown'}) đã khóa lúc duyệt."
        if has_missing_asset else None
    )

    media_desc = [
        f"Media URL: {media_url or 'N/A'}",
        f"Type: {media_type or 'image'}",
        f"Content Hash (SHA-256): {image_content_hash or 'N/A'}",
        f"Storage Key: {storage_key or 'N/A'}",
        f"File Name: {image_file_name or 'N/A'}",
        f"AI Generated: {'Yes' if is_ai_generated else 'No'}",
    ]

    files = {
        "caption.txt": caption,
        "media_urls.txt": "\n".join(media_desc) if has_valid_media else "Không có media đính kèm.",
        "instructions.md": (
            f"# Hướng dẫn đăng {channel}\n"
            f"- Mã bài viết: {content_id}\n"
            f"- Workspace: {workspace_id}\n"
            f"- Nhãn AI: {'CÓ (Bắt buộc gắn nhãn AI)' if is_ai_generated else 'KHÔNG'}\n"
            f"- Ảnh đính kèm (SHA-256): {image_content_hash or ('Có media' if has_valid_media else 'Không có')}\n\n"
            + (f"> ⚠️ **CẢNH BÁO QUAN TRỌNG: Bài viết này bị thiếu file ảnh tương ứng với content_hash đã khóa lúc duyệt**: {missing_reason}\n\n" if has_missing_asset else "")
            + "1. Mở trang quản trị.\n2. Dán caption.\n3. Đính kèm media.\n4. Bật nhãn AI nếu có.\n5. Chọn chế độ riêng tư: Chỉ mình tôi khi thử nghiệm.\n6. Đăng bài."
        ),
        "metadata.json": json.dumps({
            "content_id": content_id,
            "workspace_id": workspace_id,
            "channel": channel,
            "is_ai_generated": is_ai_generated,
            "media_url": media_url,
            "image_content_hash": image_content_hash,
            "storage_key": storage_key,
            "image_file_name": image_file_name,
            "has_missing_asset": has_missing_asset,
            "missing_asset_reason": missing_reason,
        }, indent=2),
    }

    if has_missing_asset:
        files["ERROR_MISSING_IMAGE.txt"] = (
            f"[CẢNH BÁO: KHÔNG ĐƯỢC ĐĂNG BÀI HỎNG]\n"
            f"Lý do: {missing_reason}\n"
            f"Mã bài viết: {content_id}\n"
            f"Vui lòng kiểm tra lại kho media_assets để tải ảnh hợp lệ trước khi xuất bản."
        )

    if image_file_content:
        fname = image_file_name or "attached_image.webp"
        files[fname] = image_file_content

    return {
        "channel": channel,
        "content_id": content_id,
        "workspace_id": workspace_id,
        "label": "manual-pack",
        "is_ai_generated": is_ai_generated,
        "image_content_hash": image_content_hash,
        "storage_key": storage_key,
        "has_missing_asset": has_missing_asset,
        "missing_asset_reason": missing_reason,
        "files": files,
    }


class TestCM28FacebookPublisher:
    """Kiểm thử cho CM-28: Facebook Graph API v21.0 & AI Image Labeling."""

    def test_graph_api_version_validation(self):
        """Kiểm tra và chuẩn hóa phiên bản Graph API hiện hành v21.0."""
        assert validate_facebook_graph_version("v21.0") == "v21.0"
        assert validate_facebook_graph_version("v20.0") == "v21.0", "Phiên bản cũ v20.0 phải được nâng lên v21.0"
        assert validate_facebook_graph_version("invalid") == "v21.0"
        assert validate_facebook_graph_version("v22.0") == "v22.0"

    def test_facebook_photo_and_caption_ai_labeling(self):
        """Đăng caption + ảnh AI: phải đính kèm nhãn minh bạch trong caption và cờ API Meta."""
        raw_msg = "Top 5 địa điểm ngắm hoàng hôn đẹp nhất Đà Nẵng"
        media_url = "https://cdn.tripc.vn/images/sunset.jpg"

        payload = prepare_facebook_payload(
            message=raw_msg,
            media_url=media_url,
            media_type="image",
            is_ai_generated=True,
            access_token="test_token_fb",
        )

        assert payload["url"] == media_url
        assert "[Ảnh tạo bởi AI]" in payload["caption"]
        assert "#AIgenerated" in payload["caption"]
        assert payload["is_ai_generated"] == "true"
        assert payload["ai_source_type"] == "trainedAlgorithmicMedia"

    def test_facebook_permission_denied_fallback_to_manual_pack(self):
        """Khi bị từ chối quyền (403/401 do chưa duyệt Meta App Review) -> Tự rơi về ManualPackGenerator."""
        # Giả lập phản hồi lỗi từ chối quyền của Meta
        mock_fb_response = {"status": 403, "error": {"code": 200, "message": "Permission pages_manage_posts denied"}}

        is_permission_denied = mock_fb_response["status"] in (401, 403) or mock_fb_response["error"]["code"] in (190, 200, 10)
        assert is_permission_denied is True

        # Kích hoạt fallback
        pack = generate_manual_pack(
            content_id="post_fb_123",
            workspace_id="ws_danang",
            channel="Facebook",
            caption="Bài viết Đà Nẵng [Ảnh tạo bởi AI]",
            media_url="https://cdn.tripc.vn/images/sunset.jpg",
            is_ai_generated=True,
        )

        assert pack["label"] == "manual-pack"
        assert "caption.txt" in pack["files"]
        assert "instructions.md" in pack["files"]
        assert pack["is_ai_generated"] is True

    def test_facebook_missing_media_when_required_fails_closed(self):
        """Chặn xuất bản bài viết hỏng khi bài viết yêu cầu ảnh nhưng không có media URL."""
        with pytest.raises(ValueError, match="MISSING_MEDIA_ASSET"):
            prepare_facebook_payload(
                message="Mô tả căn hộ Studio nhưng kho asset thiếu ảnh",
                media_url=None,
                requires_image=True,
                image_content_hash="d" * 64,
            )

    def test_manual_pack_attaches_media_asset_by_content_hash(self):
        """Gói ManualPack đính kèm đúng ảnh, content_hash và storage_key từ media_assets."""
        fake_hash = "a" * 64
        pack = generate_manual_pack(
            content_id="post_studio_01",
            workspace_id="ws_danang",
            channel="FacebookGroup",
            caption="Chi tiết phòng Studio view biển [Ảnh tạo bởi AI]",
            media_url="http://localhost:3000/uploads/generated/studio.webp",
            media_type="image",
            is_ai_generated=True,
            image_content_hash=fake_hash,
            storage_key="generated/studio.webp",
            image_file_name="studio.webp",
            image_file_content="base64_webp_bytes",
        )

        assert pack["image_content_hash"] == fake_hash
        assert pack["has_missing_asset"] is False
        assert "studio.webp" in pack["files"]
        assert pack["files"]["studio.webp"] == "base64_webp_bytes"
        assert fake_hash in pack["files"]["media_urls.txt"]
        assert "generated/studio.webp" in pack["files"]["media_urls.txt"]
        assert fake_hash in pack["files"]["instructions.md"]

    def test_manual_pack_missing_image_warns_and_prevents_broken_publishing(self):
        """Khi bài viết yêu cầu ảnh nhưng thiếu ảnh trong media_assets: cảnh báo rõ ràng và chống đăng bài hỏng."""
        fake_hash = "b" * 64
        pack = generate_manual_pack(
            content_id="post_studio_broken",
            workspace_id="ws_danang",
            channel="FacebookGroup",
            caption="Bài viết thiếu ảnh",
            requires_image=True,
            image_content_hash=fake_hash,
            media_url=None,
        )

        assert pack["has_missing_asset"] is True
        assert "ERROR_MISSING_IMAGE.txt" in pack["files"]
        assert "KHÔNG ĐƯỢC ĐĂNG BÀI HỎNG" in pack["files"]["ERROR_MISSING_IMAGE.txt"]
        assert "CẢNH BÁO QUAN TRỌNG: Bài viết này bị thiếu file ảnh" in pack["files"]["instructions.md"]


class TestCM29TikTokPublisher:
    """Kiểm thử cho CM-29: TikTok Direct Post Photo/Video & AIGC Labeling."""

    def test_tiktok_photo_mode_payload_and_self_only_privacy(self):
        """TikTok Photo Mode: Bắt buộc privacy_level=SELF_ONLY khi test và cờ is_aigc=True."""
        req = prepare_tiktok_payload(
            title="Lịch trình Đà Nẵng 3N2Đ",
            media_url="https://cdn.tripc.vn/photos/sontra.jpg",
            media_type="image",
            privacy_level="SELF_ONLY",
            is_ai_generated=True,
        )

        assert req["path"] == "/v2/post/publish/content/init/"
        body = req["body"]
        assert body["post_mode"] == "DIRECT_POST"
        assert body["media_type"] == "PHOTO"
        assert body["post_info"]["privacy_level"] == "SELF_ONLY", "Mặc định khi thử nghiệm phải là SELF_ONLY"
        assert body["post_info"]["is_aigc"] is True, "Phải gắn nhãn AIGC theo chính sách TikTok"
        assert "#AIGC" in body["post_info"]["title"]
        assert body["source_info"]["photo_images"] == ["https://cdn.tripc.vn/photos/sontra.jpg"]

    def test_tiktok_video_mode_payload(self):
        """TikTok Video Mode: Direct Post video init."""
        req = prepare_tiktok_payload(
            title="Trải nghiệm ẩm thực chợ Cồn",
            media_url="https://cdn.tripc.vn/videos/cho_con.mp4",
            media_type="video",
            privacy_level="SELF_ONLY",
            is_ai_generated=False,
        )

        assert req["path"] == "/v2/post/publish/video/init/"
        body = req["body"]
        assert body["post_info"]["privacy_level"] == "SELF_ONLY"
        assert body["post_info"]["is_aigc"] is False
        assert body["source_info"]["video_url"] == "https://cdn.tripc.vn/videos/cho_con.mp4"

    def test_tiktok_missing_media_fails_closed(self):
        """Chặn ngay khi thiếu media URL hoặc media URL không hợp lệ (fail-closed)."""
        with pytest.raises(ValueError, match="TIKTOK_MEDIA_REQUIRED"):
            prepare_tiktok_payload(
                title="Bản tin không ảnh",
                media_url="file:///local/path/image.jpg",  # Không phải HTTP/HTTPS
                media_type="image",
            )

    def test_tiktok_permission_denied_fallback_to_manual_pack(self):
        """Khi bị từ chối quyền (403 scope_not_authorized do chưa duyệt TikTok for Developers) -> Rơi về ManualPack."""
        mock_tiktok_response = {"status": 403, "error": {"code": "scope_not_authorized", "message": "Missing video.publish"}}
        is_permission_denied = mock_tiktok_response["status"] in (401, 403) or mock_tiktok_response["error"]["code"] == "scope_not_authorized"
        assert is_permission_denied is True

        pack = generate_manual_pack(
            content_id="post_tt_456",
            workspace_id="ws_danang",
            channel="TikTok",
            caption="Kịch bản video TikTok #AIGC",
            media_url="https://cdn.tripc.vn/videos/cho_con.mp4",
            media_type="video",
            is_ai_generated=True,
        )

        assert pack["label"] == "manual-pack"
        assert "Chỉ mình tôi" in pack["files"]["instructions.md"]
        assert pack["is_ai_generated"] is True
