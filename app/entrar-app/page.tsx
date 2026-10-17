import { MobileLogin } from "./mobile-login";
export default async function MobileLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request = "" } = await searchParams;
  return (
    <main id="conteudo">
      <MobileLogin requestId={/^[a-f0-9-]{36}$/.test(request) ? request : ""} />
    </main>
  );
}
