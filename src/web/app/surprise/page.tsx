import type { Metadata } from "next";
import Atlas from "./Atlas";

export const metadata: Metadata = {
  title: "Wafer Atlas · YieldGuard",
  description: "Every WM-811K wafer, screened by our CNN and laid out by what it sees.",
};

export default function SurprisePage() {
  return <Atlas />;
}
