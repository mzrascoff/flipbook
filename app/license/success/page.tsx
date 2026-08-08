import SuccessClient from "./SuccessClient";

export const metadata = { title: "Your Flipbook license" };

export default async function LicenseSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  return <SuccessClient sessionId={session_id ?? null} />;
}
