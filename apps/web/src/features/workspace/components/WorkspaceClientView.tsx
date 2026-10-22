"use client";

import React, { useEffect, useState } from "react";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { ErrorBlock, LoadingBlock, Toast } from "@/features/shell/StatusViews";
import { ApiError, growthApi } from "@/lib/api";
import type { BusinessProfile, IntegrationsResponse, Member } from "@/lib/apiTypes";
import { formatDateTime, humanize, initials, roleLabel } from "@/lib/format";
import { useApiData } from "@/lib/useApiData";

const card = "bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6";
const input =
  "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const label = "text-[11px] font-semibold text-slate-600";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? `${err.message} (${err.code})` : fallback;
}

const toList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

type ProfileDraft = Record<
  | "company_name"
  | "website_url"
  | "industry"
  | "overview"
  | "brand_voice"
  | "brand_guidelines"
  | "target_locations"
  | "target_audiences"
  | "products_services"
  | "competitors",
  string
>;

function toDraft(p: BusinessProfile): ProfileDraft {
  return {
    company_name: p.company_name,
    website_url: p.website_url ?? "",
    industry: p.industry ?? "",
    overview: p.overview ?? "",
    brand_voice: p.brand_voice ?? "",
    brand_guidelines: p.brand_guidelines ?? "",
    target_locations: (p.target_locations ?? []).join(", "),
    target_audiences: (p.target_audiences ?? []).join(", "),
    products_services: (p.products_services ?? []).join(", "),
    competitors: (p.competitors ?? []).join(", "),
  };
}

function ProfileCard({ profile, canEdit, onSaved }: { profile: BusinessProfile; canEdit: boolean; onSaved: (p: BusinessProfile) => void }) {
  const { workspace } = useWorkspace();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await growthApi.updateBusinessProfile(workspace.id, {
        expected_version: profile.version,
        company_name: draft.company_name.trim(),
        website_url: draft.website_url.trim() || null,
        industry: draft.industry.trim() || null,
        overview: draft.overview.trim() || null,
        brand_voice: draft.brand_voice.trim() || null,
        brand_guidelines: draft.brand_guidelines.trim() || null,
        target_locations: toList(draft.target_locations),
        target_audiences: toList(draft.target_audiences),
        products_services: toList(draft.products_services),
        competitors: toList(draft.competitors),
      });
      setDraft(null);
      onSaved(updated);
    } catch (err) {
      setError(errorText(err, "Could not save the profile."));
    } finally {
      setSaving(false);
    }
  };

  const view: Array<[string, React.ReactNode]> = [
    ["Company", profile.company_name],
    ["Website", profile.website_url ?? "—"],
    ["Industry", profile.industry ?? "—"],
    ["Brand voice", profile.brand_voice ?? "—"],
    ["Target locations", (profile.target_locations ?? []).join(", ") || "—"],
    ["Target audiences", (profile.target_audiences ?? []).join(", ") || "—"],
    ["Products & services", (profile.products_services ?? []).join(", ") || "—"],
    ["Competitors", (profile.competitors ?? []).join(", ") || "—"],
  ];

  return (
    <section id="profile" className={card}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Growth Knowledge · Business profile</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Context and brand voice the agents use. Version {profile.version} · updated {formatDateTime(profile.updated_at)}
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            disabled={!canEdit}
            title={canEdit ? "Edit profile" : "Viewers cannot edit"}
            onClick={() => setDraft(toDraft(profile))}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit profile
          </button>
        )}
      </div>

      {!draft ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
            {view.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</dt>
                <dd className="text-slate-800 mt-0.5 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Overview</p>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{profile.overview ?? "—"}</p>
          </div>
          {profile.brand_guidelines && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Brand guidelines</p>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{profile.brand_guidelines}</p>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                ["company_name", "Company"],
                ["website_url", "Website URL"],
                ["industry", "Industry"],
                ["brand_voice", "Brand voice"],
              ] as const
            ).map(([key, text]) => (
              <label key={key} className="space-y-1">
                <span className={label}>{text}</span>
                <input className={input} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
              </label>
            ))}
          </div>
          {(
            [
              ["target_locations", "Target locations (comma separated)"],
              ["target_audiences", "Target audiences (comma separated)"],
              ["products_services", "Products & services (comma separated)"],
              ["competitors", "Competitors (comma separated)"],
            ] as const
          ).map(([key, text]) => (
            <label key={key} className="block space-y-1">
              <span className={label}>{text}</span>
              <input className={input} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
            </label>
          ))}
          <label className="block space-y-1">
            <span className={label}>Overview</span>
            <textarea className={`${input} min-h-[80px]`} value={draft.overview} onChange={(e) => setDraft({ ...draft, overview: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className={label}>Brand guidelines</span>
            <textarea
              className={`${input} min-h-[80px]`}
              value={draft.brand_guidelines}
              onChange={(e) => setDraft({ ...draft, brand_guidelines: e.target.value })}
            />
          </label>
          {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer disabled:opacity-60"
            >
              {saving ? "Saving…" : `Save as version ${profile.version + 1}`}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  ga4: "Google Analytics 4",
  gsc: "Google Search Console",
  facebook_page: "Facebook Page",
  instagram_business: "Instagram Business",
  meta_ads: "Meta Ads",
  website_cms: "Website CMS",
};

function IntegrationsCard({ data }: { data: IntegrationsResponse }) {
  return (
    <section id="integrations" className={card}>
      <h2 className="text-sm font-bold text-slate-900">Connection status</h2>
      <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Analytics, search, social and CMS connectors for this workspace.</p>
      <ul className="space-y-2">
        {data.providers.map((p) => (
          <li key={p.provider} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/40">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">{PROVIDER_LABELS[p.provider] ?? humanize(p.provider)}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {p.capabilities.map((c) => humanize(c.capability).toLowerCase()).join(" · ")}
              </p>
            </div>
            <span
              title={p.missing_reason ?? undefined}
              className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                p.status === "connected"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {p.status === "connected" ? "Connected" : humanize((p.missing_reason ?? p.status).toLowerCase())}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-4 mb-2">Publishing mode</p>
      <div className="flex flex-wrap gap-2">
        {data.publishing.map((p) => (
          <span key={p.channel} className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
            {humanize(p.channel)}: <strong>{p.mode}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function MembersCard({ members }: { members: Member[] }) {
  return (
    <section id="members" className={card}>
      <h2 className="text-sm font-bold text-slate-900">Members</h2>
      <p className="text-[11px] text-slate-400 mt-0.5 mb-4">{members.length} active members</p>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                {initials(m.user.full_name)}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">{m.user.full_name}</p>
                <p className="text-[11px] text-slate-500 truncate">{m.user.email}</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">{roleLabel(m.role)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AccountCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setState({ tone: "error", text: "New password must be at least 8 characters." });
    if (next !== confirm) return setState({ tone: "error", text: "New passwords do not match." });
    setSaving(true);
    setState(null);
    try {
      const res = await growthApi.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setState({ tone: "success", text: `Password changed. ${res.other_sessions_revoked} other session(s) signed out.` });
    } catch (err) {
      setState({ tone: "error", text: errorText(err, "Could not change the password.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="account" className={card}>
      <h2 className="text-sm font-bold text-slate-900">Account</h2>
      <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Changing your password signs out your other sessions.</p>
      <form onSubmit={submit} className="space-y-2.5">
        <input className={input} type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input className={input} type="password" autoComplete="new-password" placeholder="New password (min 8 characters)" value={next} onChange={(e) => setNext(e.target.value)} />
        <input className={input} type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {state && (
          <p
            className={`text-xs rounded-xl px-3 py-2 border ${
              state.tone === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            {state.text}
          </p>
        )}
        <button
          type="submit"
          disabled={saving || !current || !next}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer disabled:opacity-50"
        >
          {saving ? "Saving…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function WorkspaceContent() {
  const { workspace, role, canEdit } = useWorkspace();
  const [toast, setToast] = useState<string | null>(null);
  const { data, error, loading, reload } = useApiData(workspace.id, async (signal) => {
    const [profile, members, integrations] = await Promise.all([
      growthApi.getBusinessProfile(workspace.id, signal),
      growthApi.listMembers(workspace.id, signal),
      growthApi.getIntegrations(workspace.id, signal),
    ]);
    return { profile, members: members.items, integrations };
  });

  // Mở thẳng mục theo #hash (vd. từ sidebar "Connection status") sau khi dữ liệu đã hiển thị
  useEffect(() => {
    if (data && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Workspace & Integrations</h1>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 border border-slate-200/90 text-slate-600">
            {workspace.name} · {roleLabel(role)}
          </span>
        </div>
        <p className="text-xs md:text-sm text-slate-500 mt-1">Business context, team access and connector status.</p>
      </div>

      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Loading workspace settings…" />}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7 space-y-6">
            <ProfileCard
              key={data.profile.version}
              profile={data.profile}
              canEdit={canEdit}
              onSaved={(p) => {
                setToast(`Business profile saved as version ${p.version}.`);
                reload();
              }}
            />
            <MembersCard members={data.members} />
          </div>
          <div className="xl:col-span-5 space-y-6">
            <IntegrationsCard data={data.integrations} />
            <AccountCard />
          </div>
        </div>
      )}
    </main>
  );
}

export default function WorkspaceClientView() {
  return (
    <AppShell activeTab="workspace-integrations" pageTitle="Workspace & Integrations">
      <WorkspaceContent />
    </AppShell>
  );
}
