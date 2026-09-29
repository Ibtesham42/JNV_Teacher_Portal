import NavTabs from "@/components/NavTabs";
import { adminPageUser } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await adminPageUser();
  return (
    <div>
      <NavTabs
        items={[
          { href: "/admin", label: "Dashboard", match: "/admin", exact: true },
          { href: "/admin/upload", label: "Upload", match: "/admin/upload" },
          { href: "/admin/documents", label: "Documents", match: "/admin/documents" },
          { href: "/admin/routines", label: "Routine versions", match: "/admin/routines" },
          { href: "/admin/teachers", label: "Teachers", match: "/admin/teachers" },
          { href: "/admin/mod", label: "MOD", match: "/admin/mod" },
          { href: "/admin/weekly-off", label: "Weekly off", match: "/admin/weekly-off" },
          { href: "/admin/notices", label: "Notices", match: "/admin/notices" },
          { href: "/admin/schedules", label: "Clubs & Remedial", match: "/admin/schedules" },
          { href: "/admin/subjects", label: "Subjects", match: "/admin/subjects" },
          { href: "/admin/generate", label: "Generate roster", match: "/admin/generate" },
          { href: "/admin/storage", label: "Storage", match: "/admin/storage" },
          { href: "/admin/settings", label: "School Settings", match: "/admin/settings" },
          { href: "/admin/activity", label: "Activity Log", match: "/admin/activity" },
        ]}
      />
      {children}
    </div>
  );
}
