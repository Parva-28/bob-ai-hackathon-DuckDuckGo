"use client";

import React from "react";
import Image from "next/image";

interface BobMascotProps {
  size?: number;
  animated?: boolean;
  thinking?: boolean;
  showBubble?: boolean;
  bubbleText?: string;
  className?: string;
  onClick?: () => void;
}

export default function BobMascot({
  size = 40,
  animated = true,
  thinking = false,
  showBubble = false,
  bubbleText = "Hi! I'm Bob",
  className = "",
  onClick,
}: BobMascotProps) {
  return (
    <div
      className={`bob-mascot-container ${animated ? "animated" : ""} ${thinking ? "thinking" : ""} ${className}`}
      onClick={onClick}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
    >
      <div
        className="bob-mascot-wrapper"
        style={{
          width: size,
          height: size,
          position: "relative",
          borderRadius: "50%",
          overflow: "hidden",
          background: "#e0eaff",
          border: "1.5px solid #0f62fe",
          boxShadow: thinking
            ? "0 0 12px rgba(15, 98, 254, 0.45)"
            : "0 2px 8px rgba(0, 0, 0, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Image
          src="/bob-ai-mascot.webp"
          alt="IBM Bob AI Mascot"
          width={size}
          height={size}
          priority
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: thinking ? "scale(1.05)" : "scale(1)",
            transition: "transform 0.3s ease",
          }}
        />
      </div>

      {showBubble && (
        <div
          className="bob-speech-bubble"
          style={{
            position: "relative",
            marginLeft: "8px",
            background: "#d0e2ff",
            color: "#0043ce",
            padding: "4px 10px",
            borderRadius: "14px",
            fontSize: "11px",
            fontWeight: 600,
            whiteSpace: "nowrap",
            boxShadow: "0 1px 4px rgba(15, 98, 254, 0.15)",
            border: "1px solid rgba(15, 98, 254, 0.25)",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span>{bubbleText}</span>
          <span style={{ fontSize: "9px", opacity: 0.8 }}>✨</span>
        </div>
      )}

      <style jsx>{`
        .bob-mascot-container.animated .bob-mascot-wrapper {
          animation: bobFloat 3s ease-in-out infinite;
        }
        .bob-mascot-container.thinking .bob-mascot-wrapper {
          animation: bobThinking 1.4s ease-in-out infinite;
        }
        @keyframes bobFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-3px);
          }
        }
        @keyframes bobThinking {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          25% {
            transform: translateY(-3px) rotate(-2deg);
          }
          75% {
            transform: translateY(-1px) rotate(2deg);
          }
        }
      `}</style>
    </div>
  );
}
