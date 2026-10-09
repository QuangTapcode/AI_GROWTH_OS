"use client";

import React, { useState } from "react";
import styles from "./MembersTab.module.css";
import { INITIAL_MEMBERS } from "./constants";
import type { MemberItem, RoleType, NewMemberPayload } from "./types";
import { MembersHeader } from "./components/MembersHeader";
import { MembersToolbar } from "./components/MembersToolbar";
import { MembersTable } from "./components/MembersTable";
import { RolesPermissionsCard } from "./components/RolesPermissionsCard";
import { InviteMemberModal } from "./components/InviteMemberModal";

export default function MembersTab() {
  const [members, setMembers] = useState<MemberItem[]>(INITIAL_MEMBERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // Filter members
  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.subtitle.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === "all" || m.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const rolesInUseCount = new Set(members.map((m) => m.role)).size;

  const handleInvite = (payload: NewMemberPayload) => {
    const initials = payload.name
      .trim()
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    const colors = ["#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b", "#3b82f6"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const now = new Date();
    const joinedStr = now.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });

    const newMember: MemberItem = {
      id: `m-${Date.now()}`,
      name: payload.name,
      isYou: false,
      subtitle: payload.subtitle || "Team Member",
      email: payload.email,
      role: payload.role,
      status: "Active",
      joined: joinedStr,
      avatarBg: randomColor,
      initials: initials || "TM",
    };

    setMembers((prev) => [...prev, newMember]);
  };

  const handleRemoveMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleChangeRole = (id: string, newRole: RoleType) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, role: newRole } : m))
    );
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard?.writeText(email);
  };

  return (
    <div className={styles.container}>
      {/* 1. Top Header Card */}
      <MembersHeader onInvite={() => setIsInviteOpen(true)} />

      {/* 2. Toolbar */}
      <MembersToolbar
        totalCount={members.length}
        rolesInUseCount={rolesInUseCount}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
      />

      {/* 3. Members Table */}
      <MembersTable
        members={filteredMembers}
        onRemoveMember={handleRemoveMember}
        onChangeRole={handleChangeRole}
        onCopyEmail={handleCopyEmail}
      />

      {/* 4. Roles & Permissions Card */}
      <RolesPermissionsCard />

      {/* 5. Invite Modal */}
      <InviteMemberModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        onInvite={handleInvite}
      />
    </div>
  );
}
