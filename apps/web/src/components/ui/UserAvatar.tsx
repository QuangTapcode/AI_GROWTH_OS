import React from "react";

export interface UserAvatarProps {
  size?: number;
  className?: string;
}

export default function UserAvatar({ size = 36, className }: UserAvatarProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 0 0 1.5px rgba(226, 232, 240, 0.8)",
        flexShrink: 0,
        backgroundColor: "#1e1b4b",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <defs>
          <radialGradient id="sunGlow" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="25%" stopColor="#fb923c" />
            <stop offset="60%" stopColor="#ea580c" />
            <stop offset="100%" stopColor="#312e81" />
          </radialGradient>
        </defs>

        {/* Sky with glowing sun */}
        <rect width="40" height="40" fill="url(#sunGlow)" />
        <circle cx="20" cy="18" r="7" fill="#fef08a" opacity="0.9" />

        {/* Distant mountain silhouette */}
        <polygon points="0,32 12,24 24,30 36,22 40,26 40,40 0,40" fill="#431407" opacity="0.6" />

        {/* Foreground person silhouette */}
        <circle cx="20" cy="27" r="4" fill="#0f172a" />
        <path d="M12 40c0-5 3.5-8 8-8s8 3 8 8z" fill="#0f172a" />
      </svg>
    </div>
  );
}
