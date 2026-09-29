import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getSchoolSettings } from "@/lib/settings";
import SettingsManager from "./SettingsManager";

export const metadata: Metadata = { title: "School settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const settings = await getSchoolSettings();
  return (
    <div>
      <PageHeader
        title="School settings"
        subtitle="School identity, contact details and the class/section list - editable here, no code change needed."
      />
      <SettingsManager settings={settings} />
    </div>
  );
}
