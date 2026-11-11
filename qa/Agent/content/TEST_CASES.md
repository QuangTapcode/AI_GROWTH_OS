# Content Agent Test Cases

These are the 33 cases executed in the Content Agent QA suite. They combine
equivalence partitioning (EP), boundary value analysis (BVA), decision tables,
and state transitions where appropriate; techniques are not split into
separate suites.

| # | Case / pytest id | Technique | Scenario and expected result |
|---:|---|---|---|
| 1 | `test_facebook_pack_is_grounded_versioned_and_kept_for_human_review` | Decision table / state | Supported source-backed Facebook content produces a cited draft, exact CTA and valid hashtags; it remains unapplied and requires human approval. |
| 2 | `ep-foreign-parent-tenant` | EP / decision table | SEO parent belongs to another workspace; reject with `TENANT_SCOPE_VIOLATION` before calling the provider. |
| 3 | `decision-parent-must-be-seo` | Decision table | Parent artifact has the wrong role; reject with `INVALID_ARTIFACT_ROLE`. |
| 4 | `decision-parent-snapshot-mismatch` | Decision table | Parent uses a stale context snapshot; reject with `STALE_ARTIFACT_CONTEXT`. |
| 5 | `decision-tampered-parent` | Decision table | Parent content hash is tampered; reject with `ARTIFACT_HASH_MISMATCH`. |
| 6 | `bva-parent-version` | BVA | Parent artifact and article versions disagree; reject with `ARTIFACT_VERSION_MISMATCH`. |
| 7 | `decision-revoked-citation` | Decision table | Evidence source has been revoked; reject with `UNGROUNDED_ARTIFACT`. |
| 8 | `ep-cross-tenant-image` | EP | Image asset belongs to another workspace; reject with `TENANT_SCOPE_VIOLATION`. |
| 9 | `ep-facebook` | EP | Facebook is a supported target; create a Facebook pack. |
| 10 | `ep-tiktok` | EP / state | TikTok is a supported target; create a TikTok-targeted pack. |
| 11 | `ep-unsupported-channel-rejected` | EP | Instagram is unsupported; reject with `INVALID_CHANNELS` before calling the provider. |
| 12 | `bva-empty-cta` | BVA | Empty CTA is outside the schema boundary; reject at intake. |
| 13 | `bva-one-character-cta` | BVA | One-character CTA is accepted. |
| 14 | `bva-maximum-cta` | BVA | CTA at the 200-character maximum is accepted. |
| 15 | `bva-cta-over-maximum` | BVA | CTA at 201 characters is rejected at intake. |
| 16 | `decision-no-links` | Decision table | Facebook draft containing an external URL fails with `UNSUPPORTED_CONTENT_CLAIM`. |
| 17 | `decision-no-unbacked-promotion` | Decision table | Unsupported promotional claim fails with `UNSUPPORTED_CONTENT_CLAIM`. |
| 18 | `decision-no-unbacked-price` | Decision table | Unsupported price claim fails with `UNSUPPORTED_CONTENT_CLAIM`. |
| 19 | `test_unsupported_factual_sentence_is_removed_from_facebook_copy` | Decision table | Keep source-supported copy and remove an unsupported amenity claim. |
| 20 | `test_facebook_question_is_not_duplicated_and_hook_is_capped` | BVA / decision table | Cap the hook at 150 characters and include a repeated discussion question only once. |
| 21 | `test_facebook_only_pack_without_image_is_still_a_draft_with_image_suggestion` | State transition | Facebook-only with no approved image remains a draft and provides an image suggestion; it does not block on a media asset. |
| 22 | `test_tiktok_target_requires_approved_media_asset` | State transition | TikTok target without approved media has `needs_assets`; retain the script but mark the missing asset. |
| 23 | `test_approved_asset_clears_tiktok_asset_gate_and_preserves_parent_reference` | State transition | Supplying an approved asset clears the TikTok asset gate and retains the parent article reference. |
| 24 | `test_requested_tiktok_script_uses_exact_cta_and_flags_short_duration` | Decision table / state | Optional script uses the exact CTA; a short script is retained and flagged as outside the target length. |
| 25 | `test_invalid_optional_tiktok_script_does_not_discard_facebook_pack` | State transition | Invalid optional TikTok output is skipped while the required Facebook draft completes. |
| 26 | `ep-pending-asset` | EP | Pending asset is excluded from the output pack. |
| 27 | `ep-revoked-asset` | EP | Revoked asset is excluded from the output pack. |
| 28 | `ep-approved-asset` | EP | Approved, licensed, attributed asset is included in the output pack. |
| 29 | `test_real_product_without_real_asset_never_gets_ai_image_suggestion` | Decision table | Real product without a real approved asset does not receive an AI-generated image suggestion. |
| 30 | `test_parent_missing_facts_propagate_to_social_pack_status` | State transition | Parent SEO missing facts propagate to the social pack as `insufficient_data`. |
| 31 | `test_empty_parent_article_is_rejected_without_provider_call` | EP | Empty parent article fails with `MISSING_PARENT_CONTENT` before provider invocation. |
| 32 | `test_content_operation_aliases_are_currently_bound_to_the_same_pack_handler` | Decision table / routing | Confirm registered `content.generate` and `content.quality_check` currently return the same SocialPack shape as the shared handler. |
| 33 | `test_same_job_retry_returns_persisted_pack_without_a_second_provider_call` | State transition | Retrying a completed job returns the persisted result without a second provider call. |

## Coverage scope

The suite covers the registered Content pipeline via the internal run API,
using synthetic source data and a deterministic provider. See
[README.md](README.md) for run commands, results, regression coverage, and
known routing limitations.
