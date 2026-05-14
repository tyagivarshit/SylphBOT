import LoginClient from "./loginClient";

type LoginSearchParams = Promise<{
  email?: string | string[];
  authError?: string | string[];
  error?: string | string[];
}>;

const getSingleValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const params = await searchParams;

  return (
    <LoginClient
      initialEmail={getSingleValue(params.email) || ""}
      initialAuthError={
        getSingleValue(params.authError) ||
        getSingleValue(params.error) ||
        ""
      }
    />
  );
}
