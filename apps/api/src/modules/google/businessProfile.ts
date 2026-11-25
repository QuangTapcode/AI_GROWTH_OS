/**
 * Google Business Profile (Google Maps) API: đọc review, trả lời review, đăng Local Post, cập nhật thực đơn.
 * Endpoint review/localPosts/foodMenus vẫn ở My Business API v4; danh sách account/location ở API v1 mới.
 */
import type { FetchLike } from "../ai/providers";
import { googleJson, type GoogleAuth } from "./oauth";

export interface GbpLocationRef {
  accountId: string; // chỉ phần số, không có tiền tố "accounts/"
  locationId: string; // chỉ phần số, không có tiền tố "locations/"
  title?: string;
  mapsUri?: string;
  placeId?: string;
}

export interface GbpReview {
  reviewId: string;
  name: string; // accounts/{a}/locations/{l}/reviews/{id}
  reviewerName: string;
  reviewerPhoto?: string;
  rating: number; // 1..5, 0 nếu không có
  comment: string;
  createTime: string;
  updateTime: string;
  existingReply?: { comment: string; updateTime: string };
}

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const V4 = "https://mybusiness.googleapis.com/v4";

export function locationPath(ref: GbpLocationRef): string {
  return `accounts/${ref.accountId}/locations/${ref.locationId}`;
}

/** GBP_ACCOUNT_ID / GBP_LOCATION_ID trong env (pilot một quán) — ưu tiên hơn tự dò. */
export function envLocationRef(): GbpLocationRef | null {
  const accountId = process.env.GBP_ACCOUNT_ID?.trim().replace(/^accounts\//, "");
  const locationId = process.env.GBP_LOCATION_ID?.trim().replace(/^.*locations\//, "");
  return accountId && locationId ? { accountId, locationId } : null;
}

/** Tự tìm địa điểm của quán trong tài khoản Google đã cấp quyền; khớp theo link Maps / tên khi có nhiều địa điểm. */
export async function discoverLocation(
  auth: GoogleAuth,
  hint: { mapsUrl?: string | null; businessName?: string | null },
  fetchImpl?: FetchLike,
): Promise<GbpLocationRef | null> {
  const accounts = await googleJson<{ accounts?: Array<{ name: string }> }>(
    auth,
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",
    {},
    fetchImpl,
  );
  const candidates: GbpLocationRef[] = [];
  for (const account of accounts.accounts ?? []) {
    const accountId = account.name.replace(/^accounts\//, "");
    const locations = await googleJson<{
      locations?: Array<{ name: string; title?: string; metadata?: { mapsUri?: string; placeId?: string } }>;
    }>(
      auth,
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,metadata&pageSize=100`,
      {},
      fetchImpl,
    );
    for (const loc of locations.locations ?? []) {
      candidates.push({
        accountId,
        locationId: loc.name.replace(/^locations\//, ""),
        title: loc.title,
        mapsUri: loc.metadata?.mapsUri,
        placeId: loc.metadata?.placeId,
      });
    }
  }
  if (candidates.length <= 1) return candidates[0] ?? null;
  const url = hint.mapsUrl?.trim() ?? "";
  const byPlace = candidates.find((c) => (c.placeId && url.includes(c.placeId)) || (c.mapsUri && url && (url.startsWith(c.mapsUri) || c.mapsUri.startsWith(url))));
  if (byPlace) return byPlace;
  const name = hint.businessName?.trim().toLowerCase();
  if (name) {
    const byName = candidates.find((c) => c.title?.toLowerCase() === name) ?? candidates.find((c) => c.title?.toLowerCase().includes(name));
    if (byName) return byName;
  }
  return null; // nhiều địa điểm mà không khớp: không đoán bừa
}

export async function listReviews(
  auth: GoogleAuth,
  ref: GbpLocationRef,
  fetchImpl?: FetchLike,
  maxPages = 3,
): Promise<{ reviews: GbpReview[]; averageRating: number | null; totalReviewCount: number | null }> {
  const reviews: GbpReview[] = [];
  let pageToken: string | undefined;
  let averageRating: number | null = null;
  let totalReviewCount: number | null = null;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
    if (pageToken) params.set("pageToken", pageToken);
    const json = await googleJson<{
      reviews?: Array<{
        reviewId: string;
        name: string;
        reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
        starRating?: string;
        comment?: string;
        createTime: string;
        updateTime: string;
        reviewReply?: { comment: string; updateTime: string };
      }>;
      averageRating?: number;
      totalReviewCount?: number;
      nextPageToken?: string;
    }>(auth, `${V4}/${locationPath(ref)}/reviews?${params.toString()}`, {}, fetchImpl);
    averageRating = json.averageRating ?? averageRating;
    totalReviewCount = json.totalReviewCount ?? totalReviewCount;
    for (const r of json.reviews ?? []) {
      reviews.push({
        reviewId: r.reviewId,
        name: r.name,
        reviewerName: r.reviewer?.isAnonymous ? "Khách ẩn danh" : r.reviewer?.displayName || "Khách hàng Google",
        reviewerPhoto: r.reviewer?.profilePhotoUrl,
        rating: STAR[r.starRating ?? ""] ?? 0,
        comment: r.comment ?? "",
        createTime: r.createTime,
        updateTime: r.updateTime,
        existingReply: r.reviewReply,
      });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return { reviews, averageRating, totalReviewCount };
}

export async function replyToReview(auth: GoogleAuth, reviewName: string, comment: string, fetchImpl?: FetchLike): Promise<{ updateTime?: string }> {
  return googleJson<{ comment?: string; updateTime?: string }>(
    auth,
    `${V4}/${reviewName}/reply`,
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment }) },
    fetchImpl,
  );
}

export type GbpCallToAction = "BOOK" | "ORDER" | "LEARN_MORE" | "CALL" | "SIGN_UP" | "SHOP";

export async function createLocalPost(
  auth: GoogleAuth,
  ref: GbpLocationRef,
  post: { summary: string; photoUrl?: string; callToAction?: { actionType: GbpCallToAction; url?: string } },
  fetchImpl?: FetchLike,
): Promise<{ name?: string; searchUrl?: string; state?: string }> {
  const body: Record<string, unknown> = {
    languageCode: "vi",
    summary: post.summary.slice(0, 1500),
    topicType: "STANDARD",
  };
  if (post.photoUrl) body.media = [{ mediaFormat: "PHOTO", sourceUrl: post.photoUrl }];
  if (post.callToAction) {
    // CALL dùng số điện thoại của hồ sơ, không nhận url.
    body.callToAction = post.callToAction.actionType === "CALL" ? { actionType: "CALL" } : post.callToAction;
  }
  return googleJson(auth, `${V4}/${locationPath(ref)}/localPosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, fetchImpl);
}

/** Thêm ảnh mới (món ăn, không gian) vào hồ sơ Maps. */
export async function uploadLocationPhoto(
  auth: GoogleAuth,
  ref: GbpLocationRef,
  photo: { sourceUrl: string; category: "FOOD_AND_DRINK" | "INTERIOR" | "EXTERIOR" | "MENU" | "ADDITIONAL"; description?: string },
  fetchImpl?: FetchLike,
): Promise<{ name?: string; googleUrl?: string }> {
  return googleJson(auth, `${V4}/${locationPath(ref)}/media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mediaFormat: "PHOTO",
      locationAssociation: { category: photo.category },
      sourceUrl: photo.sourceUrl,
      ...(photo.description ? { description: photo.description.slice(0, 300) } : {}),
    }),
  }, fetchImpl);
}

export interface MenuSection {
  name: string;
  items: Array<{ name: string; description?: string; priceVnd?: number }>;
}

/** Ghi đè thực đơn trên Maps bằng thực đơn đã được chủ quán duyệt (giá lấy từ dữ liệu quán, AI không tự đặt giá). */
export async function updateFoodMenu(auth: GoogleAuth, ref: GbpLocationRef, sections: MenuSection[], fetchImpl?: FetchLike): Promise<unknown> {
  const label = (displayName: string, description?: string) => [{ displayName: displayName.slice(0, 140), ...(description ? { description: description.slice(0, 1000) } : {}), languageCode: "vi" }];
  const menus = [
    {
      labels: label("Thực đơn"),
      sections: sections.map((section) => ({
        labels: label(section.name),
        items: section.items.map((item) => ({
          labels: label(item.name, item.description),
          ...(item.priceVnd !== undefined
            ? { attributes: { price: { currencyCode: "VND", units: String(Math.round(item.priceVnd)) } } }
            : {}),
        })),
      })),
    },
  ];
  return googleJson(auth, `${V4}/${locationPath(ref)}/foodMenus?updateMask=menus`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ menus }),
  }, fetchImpl);
}
