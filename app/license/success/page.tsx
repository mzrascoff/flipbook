import SuccessClient from "./SuccessClient";

export const metadata = { title: "Your Flipbook license" };

export default async function LicenseSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  // The webhook mails the license only when sending is configured, so the
  // page mentions an email only then.
  return (
    <SuccessClient
      sessionId={session_id ?? null}
      emailEnabled={Boolean(process.env.RESEND_API_KEY)}
    />
  );
}
