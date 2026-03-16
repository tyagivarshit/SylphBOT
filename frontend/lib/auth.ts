const API = process.env.NEXT_PUBLIC_API_URL;

export async function loginUser(email: string, password: string) {

  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      email,
      password
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Login failed");
  }

  return data;
}

export async function registerUser(
  name: string,
  email: string,
  password: string
) {

  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      name,
      email,
      password
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Registration failed");
  }

  return data;
}

export async function verifyEmail(token: string) {

  const res = await fetch(
    `${API}/api/auth/verify-email?token=${token}`,
    {
      credentials: "include"
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Verification failed");
  }

  return data;
}

/* ================= RESEND VERIFICATION ================= */

export async function resendVerification(email: string) {

  const res = await fetch(`${API}/api/auth/resend-verification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      email
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to resend verification email");
  }

  return data;
}

/* ================= FORGOT PASSWORD ================= */

export async function forgotPassword(email: string) {

  const res = await fetch(`${API}/api/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      email
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to send reset link");
  }

  return data;
}

/* ================= RESET PASSWORD ================= */

export async function resetPassword(
  token: string,
  password: string
) {

  const res = await fetch(`${API}/api/auth/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      token,
      password
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Password reset failed");
  }

  return data;
}