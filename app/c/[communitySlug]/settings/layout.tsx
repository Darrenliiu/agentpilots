import {
  CommunitySettingsMobileNav,
  CommunitySettingsSidebar,
} from "@/components/community-settings-sidebar";
import packageJson from "@/package.json";

export default async function CommunitySettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ communitySlug: string }>;
}) {
  const { communitySlug } = await params;
  const version =
    typeof packageJson.version === "string" ? packageJson.version : "0.1.0";

  return (
    <>
      <CommunitySettingsSidebar communitySlug={communitySlug} version={version} />
      <div className="settings-content min-h-screen overflow-auto">
        <CommunitySettingsMobileNav communitySlug={communitySlug} />
        {children}
      </div>
    </>
  );
}
